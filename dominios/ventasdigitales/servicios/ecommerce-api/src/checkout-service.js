'use strict';

const { randomUUID } = require('node:crypto');

class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_COLLECTIONS = {
  orders: { name: 'ventasdigitales-orders', indexField: 'pedidoId' },
  lines: { name: 'ventasdigitales-order-lines', indexField: 'pedidoId' },
  payments: { name: 'ventasdigitales-order-payments', indexField: 'pagoId' },
};

const DEFAULT_EVENT_CHANNEL = 'ventasdigitales.orders';

function ensureObject(value, message) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CheckoutError(message);
  }
}

function trimToNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveNumber(value, message) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CheckoutError(message);
  }
  return Number(parsed.toFixed(2));
}

function parseNonNegativeNumber(value, message) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CheckoutError(message);
  }
  return Number(parsed.toFixed(2));
}

function parsePositiveInteger(value, message) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CheckoutError(message);
  }
  return parsed;
}

function normalizeCollections(collections = {}) {
  return {
    orders: { ...DEFAULT_COLLECTIONS.orders, ...(collections.orders ?? {}) },
    lines: { ...DEFAULT_COLLECTIONS.lines, ...(collections.lines ?? {}) },
    payments: { ...DEFAULT_COLLECTIONS.payments, ...(collections.payments ?? {}) },
  };
}

class CheckoutProcessor {
  constructor(options = {}) {
    const {
      nosqlUrl = 'http://127.0.0.1:4100',
      eventBusUrl = 'http://127.0.0.1:4200',
      collections,
      eventChannel = DEFAULT_EVENT_CHANNEL,
      fetchImpl,
      idGenerator = () => randomUUID(),
      clock = () => new Date(),
    } = options;

    this.nosqlUrl = nosqlUrl;
    this.eventBusUrl = eventBusUrl;
    this.collections = normalizeCollections(collections);
    this.eventChannel = eventChannel;
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.fetch = fetchImpl || globalThis.fetch;

    if (typeof this.fetch !== 'function') {
      throw new Error('Se requiere una implementación de fetch para el CheckoutProcessor');
    }
  }

  async initialize() {
    const definitions = Object.values(this.collections);
    for (const definition of definitions) {
      await this.ensureCollection(definition);
    }
  }

  async ensureCollection(definition) {
    const url = new URL('/collections', this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: definition.name, indexField: definition.indexField }),
    });

    if (response.status === 201 || response.status === 409) {
      return;
    }

    let message = `No se pudo crear la colección ${definition.name}`;
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') {
        message = body.message;
      }
    } catch (_error) {
      // Ignorar errores al parsear la respuesta
    }
    throw new Error(message);
  }

  async processOrder(payload) {
    const normalized = this.normalizeOrderPayload(payload);

    const orderId = this.idGenerator();
    const customerId = normalized.customerId ?? this.idGenerator();
    const paymentId = this.idGenerator();

    const confirmationDate = normalized.confirmedAt ?? this.clock();
    if (!(confirmationDate instanceof Date) || Number.isNaN(confirmationDate.getTime())) {
      throw new Error('La función clock debe devolver instancias de Date válidas');
    }
    const confirmedAtIso = confirmationDate.toISOString();

    const orderEntity = {
      pedidoId: orderId,
      clienteId: customerId,
      canalOrigen: normalized.channelOrigin,
      estado: 'confirmado',
      total: {
        monto: normalized.totalAmount,
        moneda: normalized.currency,
      },
      metodosPago: [paymentId],
      confirmadoEn: confirmedAtIso,
      resumenCliente: normalized.customer,
      items: normalized.items.map((item) => ({ sku: item.sku, cantidad: item.quantity })),
    };

    const lineItems = normalized.items.map((item, index) => ({
      lineaId: this.idGenerator(),
      pedidoId: orderId,
      sku: item.sku,
      cantidad: item.quantity,
      precioUnitario: item.price,
      totalLinea: Number((item.price * item.quantity).toFixed(2)),
      promocionesAplicadas: Array.isArray(item.promotions) ? item.promotions : [],
      posicion: index + 1,
    }));

    const paymentEntity = {
      pagoId: paymentId,
      pedidoId: orderId,
      metodo: normalized.payment.method,
      monto: normalized.totalAmount,
      moneda: normalized.currency,
      estado: 'autorizado',
      detalles: {
        metodo: normalized.payment.method,
        tarjeta: normalized.payment.card,
        codigoSeguridadInformado: normalized.payment.securityCodeProvided,
      },
    };

    await this.persistOrder(orderEntity, lineItems, paymentEntity);

    const customerSummary = orderEntity.resumenCliente ?? {};

    const customerForEvent = {
      id: customerId,
      firstName: customerSummary.firstName ?? null,
      lastName: customerSummary.lastName ?? null,
      email: customerSummary.email ?? null,
      phone: customerSummary.phone ?? null,
    };

    const orderForEvent = {
      id: orderId,
      customerId,
      channelOrigin: orderEntity.canalOrigen,
      status: orderEntity.estado,
      total: {
        amount: orderEntity.total.monto,
        currency: orderEntity.total.moneda,
      },
      paymentIds: Array.isArray(orderEntity.metodosPago) ? [...orderEntity.metodosPago] : [],
      confirmedAt: orderEntity.confirmadoEn,
      items: Array.isArray(orderEntity.items)
        ? orderEntity.items.map((item) => ({
            sku: item.sku,
            quantity: item.cantidad,
          }))
        : [],
    };

    const itemsForEvent = lineItems.map((line) => ({
      id: line.lineaId,
      orderId: line.pedidoId,
      sku: line.sku,
      quantity: line.cantidad,
      unitPrice: line.precioUnitario,
      lineTotal: line.totalLinea,
      promotions: Array.isArray(line.promocionesAplicadas) ? line.promocionesAplicadas : [],
      position: line.posicion,
    }));

    const paymentDetails = paymentEntity.detalles ?? {};
    const paymentCard = paymentDetails.tarjeta ?? {};

    const paymentForEvent = {
      id: paymentEntity.pagoId,
      orderId: paymentEntity.pedidoId,
      method: paymentEntity.metodo,
      amount: paymentEntity.monto,
      currency: paymentEntity.moneda,
      status: paymentEntity.estado,
      securityCodeProvided: Boolean(paymentDetails.codigoSeguridadInformado),
      card: { ...paymentCard },
    };

    const eventPayload = {
      order: orderForEvent,
      customer: customerForEvent,
      items: itemsForEvent,
      payment: paymentForEvent,
    };

    const eventRecord = await this.publishEvent(eventPayload);

    return {
      orderId,
      customerId,
      paymentId,
      confirmedAt: confirmedAtIso,
      eventRecord,
    };
  }

  async persistOrder(orderEntity, lineItems, paymentEntity) {
    await this.postJson(new URL(`/collections/${this.collections.orders.name}/items`, this.nosqlUrl), orderEntity);

    for (const line of lineItems) {
      await this.postJson(new URL(`/collections/${this.collections.lines.name}/items`, this.nosqlUrl), line);
    }

    await this.postJson(
      new URL(`/collections/${this.collections.payments.name}/items`, this.nosqlUrl),
      paymentEntity,
    );
  }

  async publishEvent(payload) {
    const response = await this.fetch(new URL('/events', this.eventBusUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: this.eventChannel, type: 'OrderConfirmed', payload }),
    });

    if (response.status !== 201) {
      let message = 'No se pudo publicar el evento OrderConfirmed';
      try {
        const body = await response.json();
        if (body && typeof body.message === 'string') {
          message = body.message;
        }
      } catch (_error) {
        // Ignorar
      }
      throw new Error(message);
    }

    return response.json();
  }

  async postJson(url, body) {
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status >= 200 && response.status < 300) {
      return response.json();
    }

    let message = 'No se pudo persistir la entidad en la base NoSQL';
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed.message === 'string') {
        message = parsed.message;
      }
    } catch (_error) {
      // Ignorar
    }
    throw new Error(message);
  }

  normalizeOrderPayload(payload) {
    ensureObject(payload, 'El payload del pedido debe ser un objeto');

    const rawItems = Array.isArray(payload.items) ? payload.items : null;
    if (!rawItems || rawItems.length === 0) {
      throw new CheckoutError('El pedido debe incluir al menos un ítem');
    }

    const items = rawItems.map((item, index) => {
      ensureObject(item, `El ítem ${index + 1} del pedido no es válido`);
      const sku = trimToNull(item.sku);
      if (!sku) {
        throw new CheckoutError(`El ítem ${index + 1} debe incluir un SKU`);
      }
      const quantity = parsePositiveInteger(item.quantity, `La cantidad del ítem ${index + 1} no es válida`);
      const price = parseNonNegativeNumber(item.price, `El precio del ítem ${index + 1} no es válido`);
      return { sku, quantity, price, promotions: item.promotions ?? [] };
    });

    const totalAmount = parsePositiveNumber(payload.totalAmount, 'El total del pedido no es válido');
    const currency = trimToNull(payload.currency);
    if (!currency) {
      throw new CheckoutError('La moneda del pedido es obligatoria');
    }

    let confirmedAt = null;
    if (payload.confirmedAt) {
      const date = new Date(payload.confirmedAt);
      if (!Number.isNaN(date.getTime())) {
        confirmedAt = date;
      }
    }

    const customerPayload = payload.customer ?? {};
    ensureObject(customerPayload, 'Los datos del cliente no son válidos');
    const customer = {
      firstName: trimToNull(customerPayload.firstName ?? customerPayload.first_name ?? customerPayload.first),
      lastName: trimToNull(customerPayload.lastName ?? customerPayload.last_name ?? customerPayload.last),
      email: trimToNull(customerPayload.email),
      phone: trimToNull(customerPayload.phone),
    };

    const paymentPayload = payload.payment ?? {};
    ensureObject(paymentPayload, 'Los datos de pago no son válidos');
    const method = trimToNull(paymentPayload.method);
    if (!method) {
      throw new CheckoutError('El método de pago es obligatorio');
    }

    const cardPayload = paymentPayload.card ?? {};
    ensureObject(cardPayload, 'Los datos de la tarjeta no son válidos');
    const card = {
      holderName: trimToNull(cardPayload.holderName ?? cardPayload.holder_name),
      last4: trimToNull(cardPayload.last4),
      brand: trimToNull(cardPayload.brand),
      expiryMonth: trimToNull(cardPayload.expiryMonth ?? cardPayload.expiry_month),
      expiryYear: trimToNull(cardPayload.expiryYear ?? cardPayload.expiry_year),
    };

    const channelOrigin = trimToNull(payload.channelOrigin) ?? 'web';

    return {
      items,
      totalAmount,
      currency,
      confirmedAt,
      customer,
      payment: {
        method,
        card,
        securityCodeProvided: Boolean(paymentPayload.securityCodeProvided),
      },
      channelOrigin,
      customerId: trimToNull(payload.customerId) ?? null,
    };
  }
}

module.exports = {
  CheckoutProcessor,
  CheckoutError,
  DEFAULT_COLLECTIONS,
  DEFAULT_EVENT_CHANNEL,
};
