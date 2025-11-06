'use strict';

const DEFAULT_COLLECTION = { name: 'atencionalcliente-customers', indexField: 'customerId' };
const DEFAULT_EVENT_CHANNEL = 'ventasdigitales.orders';
const DEFAULT_CONSUMER_NAME = 'crm-atencion-clientes';

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('Se requiere una implementación de fetch para CrmSyncProcessor');
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function parseErrorMessage(response, fallbackMessage) {
  let message = fallbackMessage;
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') {
      message = body.message;
    }
  } catch (_error) {
    // Ignorar errores al parsear el cuerpo
  }
  return message;
}

class CrmSyncProcessor {
  constructor(options = {}) {
    const {
      nosqlUrl = 'http://127.0.0.1:4100',
      eventBusUrl = 'http://127.0.0.1:4200',
      collection = DEFAULT_COLLECTION,
      eventChannel = DEFAULT_EVENT_CHANNEL,
      consumerName = DEFAULT_CONSUMER_NAME,
      fetchImpl,
      clock = () => new Date(),
      batchSize = 25,
    } = options;

    if (!collection || typeof collection.name !== 'string' || typeof collection.indexField !== 'string') {
      throw new Error('La colección del CRM debe incluir name e indexField');
    }

    this.nosqlUrl = nosqlUrl;
    this.eventBusUrl = eventBusUrl;
    this.collection = { name: collection.name, indexField: collection.indexField };
    this.eventChannel = eventChannel;
    this.consumerName = consumerName;
    this.batchSize = batchSize;
    this.fetch = ensureFetch(fetchImpl);
    this.clock = clock;

    this.stats = {
      lastSyncAt: null,
      totalEventsRead: 0,
      totalEventsProcessed: 0,
      totalCustomersCreated: 0,
      totalCustomersUpdated: 0,
    };

    this.syncing = false;
  }

  async initialize() {
    await this.ensureCollection();
    await this.ensureConsumer();
  }

  async ensureCollection() {
    const url = new URL('/collections', this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: this.collection.name, indexField: this.collection.indexField }),
    });

    if (response.status === 201 || response.status === 409) {
      return;
    }

    const message = await parseErrorMessage(
      response,
      `No se pudo asegurar la colección ${this.collection.name} en la base NoSQL`,
    );
    throw new Error(message);
  }

  async ensureConsumer() {
    const url = new URL('/consumers', this.eventBusUrl);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: this.consumerName, channel: this.eventChannel }),
    });

    if (response.status === 201) {
      return;
    }

    const message = await parseErrorMessage(
      response,
      `No se pudo asegurar el consumidor ${this.consumerName} en el canal ${this.eventChannel}`,
    );
    throw new Error(message);
  }

  getStats() {
    return { ...this.stats };
  }

  async syncPendingEvents() {
    if (this.syncing) {
      return { read: 0, processed: 0, created: 0, updated: 0, skipped: 0, inProgress: true };
    }

    this.syncing = true;

    let read = 0;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      while (true) {
        const batch = await this.pollEvents();
        if (batch.length === 0) {
          break;
        }

        read += batch.length;

        for (const event of batch) {
          const result = await this.handleEvent(event);
          if (result.handled) {
            processed += 1;
            if (result.action === 'created') {
              created += 1;
            } else if (result.action === 'updated') {
              updated += 1;
            }
          } else {
            skipped += 1;
          }
        }

        if (batch.length < this.batchSize) {
          break;
        }
      }

      const now = this.clock();
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new Error('La función clock debe devolver instancias de Date válidas');
      }

      const nowIso = now.toISOString();
      this.stats.lastSyncAt = nowIso;
      this.stats.totalEventsRead += read;
      this.stats.totalEventsProcessed += processed;
      this.stats.totalCustomersCreated += created;
      this.stats.totalCustomersUpdated += updated;

      return { read, processed, created, updated, skipped, inProgress: false, completedAt: nowIso };
    } finally {
      this.syncing = false;
    }
  }

  async pollEvents() {
    const url = new URL(`/consumers/${encodeURIComponent(this.consumerName)}/poll`, this.eventBusUrl);
    url.searchParams.set('channel', this.eventChannel);

    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: this.batchSize, autoCommit: true }),
    });

    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudieron obtener eventos pendientes del bus');
      throw new Error(message);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      return [];
    }

    return payload.items;
  }

  async handleEvent(event) {
    if (!event || event.type !== 'OrderConfirmed') {
      return { handled: false, reason: 'ignored' };
    }

    const payload = event.payload || {};
    const order = payload.order || {};
    const customer = payload.customer || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const payment = payload.payment || {};

    const customerId = normalizeString(customer.id ?? order.customerId);
    if (!customerId) {
      return { handled: false, reason: 'missing-customer-id' };
    }

    const profile = {
      customerId,
      firstName: normalizeString(customer.firstName),
      lastName: normalizeString(customer.lastName),
      email: normalizeString(customer.email),
      phone: normalizeString(customer.phone),
    };

    const orderSummary = this.buildOrderSummary({ order, items, payment });

    const existing = await this.findCustomerById(customerId);

    if (!existing) {
      const createdRecord = await this.createCustomerRecord(profile, orderSummary);
      return { handled: true, action: 'created', record: createdRecord };
    }

    const updatedRecord = await this.updateCustomerRecord(existing, profile, orderSummary);
    return { handled: true, action: 'updated', record: updatedRecord };
  }

  buildOrderSummary({ order = {}, items = [], payment = {} }) {
    const normalizedItems = Array.isArray(items)
      ? items.map((item) => ({
          id: normalizeString(item.id),
          orderId: normalizeString(item.orderId),
          sku: normalizeString(item.sku),
          quantity: typeof item.quantity === 'number' ? item.quantity : null,
          unitPrice: typeof item.unitPrice === 'number' ? Number(item.unitPrice) : null,
          lineTotal: typeof item.lineTotal === 'number' ? Number(item.lineTotal) : null,
          promotions: Array.isArray(item.promotions) ? [...item.promotions] : [],
          position: typeof item.position === 'number' ? item.position : null,
        }))
      : [];

    const total = order.total || {};

    return {
      orderId: normalizeString(order.id),
      status: normalizeString(order.status),
      channelOrigin: normalizeString(order.channelOrigin),
      confirmedAt: normalizeString(order.confirmedAt),
      paymentIds: Array.isArray(order.paymentIds) ? [...order.paymentIds] : [],
      total: {
        amount: typeof total.amount === 'number' ? Number(total.amount) : null,
        currency: normalizeString(total.currency),
      },
      payment: {
        id: normalizeString(payment.id),
        method: normalizeString(payment.method),
        status: normalizeString(payment.status),
        amount: typeof payment.amount === 'number' ? Number(payment.amount) : null,
        currency: normalizeString(payment.currency),
      },
      items: normalizedItems,
    };
  }

  async findCustomerById(customerId) {
    const url = new URL(`/collections/${this.collection.name}/search`, this.nosqlUrl);
    url.searchParams.set('query', customerId);

    const response = await this.fetch(url);
    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudo consultar la colección CRM');
      throw new Error(message);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      return null;
    }

    const match = payload.items.find((item) => item?.value?.customerId === customerId);
    return match || null;
  }

  async createCustomerRecord(profile, orderSummary) {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error('La función clock debe devolver instancias de Date válidas');
    }

    const timestamp = now.toISOString();
    const record = this.composeRecord(null, profile, orderSummary, timestamp);

    const url = new URL(`/collections/${this.collection.name}/items`, this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    });

    if (response.status !== 201) {
      const message = await parseErrorMessage(response, 'No se pudo crear el cliente en la colección CRM');
      throw new Error(message);
    }

    const created = await response.json();
    return created;
  }

  async updateCustomerRecord(existing, profile, orderSummary) {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error('La función clock debe devolver instancias de Date válidas');
    }

    const timestamp = now.toISOString();
    const record = this.composeRecord(existing, profile, orderSummary, timestamp);

    const url = new URL(`/collections/${this.collection.name}/items/${existing.id}`, this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    });

    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudo actualizar el cliente en la colección CRM');
      throw new Error(message);
    }

    const updated = await response.json();
    return updated;
  }

  composeRecord(existing, profile, orderSummary, timestamp) {
    const previous = existing?.value ?? {};
    const createdAt = previous.createdAt || timestamp;

    const mergedOrders = this.mergeOrders(previous.orders, orderSummary);

    const preferred = (next, current) => {
      const normalized = normalizeString(next);
      if (normalized !== null) {
        return normalized;
      }
      return current ?? null;
    };

    const result = {
      customerId: profile.customerId,
      firstName: preferred(profile.firstName, previous.firstName),
      lastName: preferred(profile.lastName, previous.lastName),
      email: preferred(profile.email, previous.email),
      phone: preferred(profile.phone, previous.phone),
      orders: mergedOrders,
      lastOrder: orderSummary,
      lastOrderId: orderSummary.orderId,
      lastOrderStatus: orderSummary.status,
      lastOrderConfirmedAt: orderSummary.confirmedAt,
      lastOrderTotal: orderSummary.total,
      createdAt,
      updatedAt: timestamp,
      orderCount: mergedOrders.length,
    };

    return result;
  }

  mergeOrders(previousOrders, newSummary) {
    const sanitizedPrevious = Array.isArray(previousOrders) ? previousOrders : [];
    const withoutDuplicate = sanitizedPrevious.filter((order) => order?.orderId !== newSummary.orderId);
    const orders = [...withoutDuplicate.map((item) => clone(item)), clone(newSummary)];

    orders.sort((a, b) => {
      const aDate = a?.confirmedAt || '';
      const bDate = b?.confirmedAt || '';
      return aDate.localeCompare(bDate);
    });

    return orders;
  }
}

module.exports = {
  CrmSyncProcessor,
  DEFAULT_COLLECTION,
  DEFAULT_EVENT_CHANNEL,
  DEFAULT_CONSUMER_NAME,
};
