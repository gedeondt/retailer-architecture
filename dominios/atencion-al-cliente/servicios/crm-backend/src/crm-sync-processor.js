'use strict';

const DEFAULT_COLLECTIONS = {
  customers: { name: 'atencionalcliente-customers', indexField: 'customerId' },
  orders: { name: 'atencionalcliente-orders', indexField: 'orderId' },
  orderItems: { name: 'atencionalcliente-order-items', indexField: 'itemId' },
  orderPayments: { name: 'atencionalcliente-order-payments', indexField: 'paymentId' },
};
const DEFAULT_COLLECTION = DEFAULT_COLLECTIONS.customers;
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

function normalizeNumber(value) {
  if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number(value);
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

function normalizeCollectionDefinition(collection, fallback) {
  if (!collection) {
    if (!fallback) {
      throw new Error('La colección del CRM debe incluir name e indexField');
    }
    return { name: fallback.name, indexField: fallback.indexField };
  }

  if (typeof collection.name !== 'string' || typeof collection.indexField !== 'string') {
    throw new Error('La colección del CRM debe incluir name e indexField');
  }

  return { name: collection.name, indexField: collection.indexField };
}

function normalizeCollections(collections, legacyCollection) {
  const base = { ...DEFAULT_COLLECTIONS };
  if (legacyCollection && !collections) {
    base.customers = normalizeCollectionDefinition(legacyCollection, DEFAULT_COLLECTIONS.customers);
    return base;
  }

  return {
    customers: normalizeCollectionDefinition(collections?.customers, DEFAULT_COLLECTIONS.customers),
    orders: normalizeCollectionDefinition(collections?.orders, DEFAULT_COLLECTIONS.orders),
    orderItems: normalizeCollectionDefinition(collections?.orderItems, DEFAULT_COLLECTIONS.orderItems),
    orderPayments: normalizeCollectionDefinition(collections?.orderPayments, DEFAULT_COLLECTIONS.orderPayments),
  };
}

class CrmSyncProcessor {
  constructor(options = {}) {
    const {
      nosqlUrl = 'http://127.0.0.1:4100',
      eventBusUrl = 'http://127.0.0.1:4200',
      collections,
      collection: legacyCollection,
      eventChannel = DEFAULT_EVENT_CHANNEL,
      consumerName = DEFAULT_CONSUMER_NAME,
      fetchImpl,
      clock = () => new Date(),
      batchSize = 25,
    } = options;

    const normalizedCollections = normalizeCollections(collections, legacyCollection);

    this.nosqlUrl = nosqlUrl;
    this.eventBusUrl = eventBusUrl;
    this.collections = normalizedCollections;
    this.collection = this.collections.customers;
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
    await this.ensureCollections();
    await this.ensureConsumer();
  }

  async ensureCollections() {
    for (const collection of Object.values(this.collections)) {
      await this.ensureCollection(collection);
    }
  }

  async ensureCollection(collection) {
    if (!collection || typeof collection.name !== 'string' || typeof collection.indexField !== 'string') {
      throw new Error('La colección del CRM debe incluir name e indexField');
    }

    const url = new URL('/collections', this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: collection.name, indexField: collection.indexField }),
    });

    if (response.status === 201 || response.status === 409) {
      return;
    }

    const message = await parseErrorMessage(
      response,
      `No se pudo asegurar la colección ${collection.name} en la base NoSQL`,
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

    const orderSummary = this.buildOrderSummary({ order, items, payment, customerId });
    const existing = await this.findCustomerById(customerId);

    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error('La función clock debe devolver instancias de Date válidas');
    }
    const timestamp = now.toISOString();

    let customerAction = 'created';
    if (!existing) {
      await this.createCustomerRecord(profile, orderSummary, timestamp);
    } else {
      customerAction = 'updated';
      await this.updateCustomerRecord(existing, profile, orderSummary, timestamp);
    }

    await this.syncOrderEntities(profile, orderSummary, timestamp);

    return { handled: true, action: customerAction };
  }

  buildOrderSummary({ order = {}, items = [], payment = {}, customerId }) {
    const normalizedItems = Array.isArray(items)
      ? items.map((item, index) => ({
          id: normalizeString(item.id) || normalizeString(item.orderItemId) || null,
          orderId: normalizeString(item.orderId),
          sku: normalizeString(item.sku),
          quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null,
          unitPrice: normalizeNumber(item.unitPrice),
          lineTotal: normalizeNumber(item.lineTotal),
          promotions: Array.isArray(item.promotions) ? [...item.promotions] : [],
          position: typeof item.position === 'number' && Number.isFinite(item.position) ? item.position : index + 1,
        }))
      : [];

    const total = order.total || {};
    const paymentSummary = payment || {};

    return {
      orderId: normalizeString(order.id),
      customerId: normalizeString(order.customerId) || normalizeString(customerId),
      status: normalizeString(order.status),
      channelOrigin: normalizeString(order.channelOrigin),
      confirmedAt: normalizeString(order.confirmedAt),
      paymentIds: Array.isArray(order.paymentIds) ? [...order.paymentIds] : [],
      total: {
        amount: normalizeNumber(total.amount),
        currency: normalizeString(total.currency),
      },
      payment: {
        id: normalizeString(paymentSummary.id),
        method: normalizeString(paymentSummary.method),
        status: normalizeString(paymentSummary.status),
        amount: normalizeNumber(paymentSummary.amount),
        currency: normalizeString(paymentSummary.currency),
        raw: clone(paymentSummary),
      },
      items: normalizedItems,
    };
  }

  async findCustomerById(customerId) {
    return this.findByIndex(this.collections.customers, customerId, (value) => value.customerId === customerId);
  }

  async findOrderById(orderId) {
    return this.findByIndex(this.collections.orders, orderId, (value) => value.orderId === orderId);
  }

  async findPaymentById(paymentId) {
    return this.findByIndex(
      this.collections.orderPayments,
      paymentId,
      (value) => value.paymentId === paymentId,
    );
  }

  async findOrderItemsByOrderId(orderId) {
    const collection = this.collections.orderItems;
    if (!collection || !orderId) {
      return [];
    }

    const url = new URL(
      `/collections/${collection.name}/search`,
      this.nosqlUrl,
    );
    url.searchParams.set('query', orderId);

    const response = await this.fetch(url);
    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudo consultar la colección CRM');
      throw new Error(message);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      return [];
    }

    return payload.items.filter((item) => item?.value?.orderId === orderId);
  }

  async findByIndex(collection, searchValue, matcher) {
    if (!collection || !searchValue) {
      return null;
    }

    const url = new URL(`/collections/${collection.name}/search`, this.nosqlUrl);
    url.searchParams.set('query', searchValue);

    const response = await this.fetch(url);
    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudo consultar la colección CRM');
      throw new Error(message);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      return null;
    }

    return payload.items.find((item) => matcher(item.value)) || null;
  }

  async createCustomerRecord(profile, orderSummary, timestamp) {
    const record = this.composeCustomerRecord(null, profile, orderSummary, timestamp);
    await this.postCollectionItem(this.collections.customers, record);
  }

  async updateCustomerRecord(existing, profile, orderSummary, timestamp) {
    const record = this.composeCustomerRecord(existing, profile, orderSummary, timestamp);
    await this.putCollectionItem(this.collections.customers, existing.id, record);
  }

  composeCustomerRecord(existing, profile, orderSummary, timestamp) {
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

    return {
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

  async syncOrderEntities(profile, orderSummary, timestamp) {
    await this.upsertOrderRecord(profile, orderSummary, timestamp);
    await this.replaceOrderItems(orderSummary, profile, timestamp);
    await this.upsertPaymentRecord(orderSummary, profile, timestamp);
  }

  composeOrderRecord(profile, orderSummary, timestamp) {
    return {
      orderId: orderSummary.orderId,
      customerId: profile.customerId,
      status: orderSummary.status,
      channelOrigin: orderSummary.channelOrigin,
      confirmedAt: orderSummary.confirmedAt,
      paymentId: orderSummary.payment.id,
      paymentIds: Array.isArray(orderSummary.paymentIds) ? [...orderSummary.paymentIds] : [],
      paymentMethod: orderSummary.payment.method,
      paymentStatus: orderSummary.payment.status,
      paymentAmount: orderSummary.payment.amount,
      paymentCurrency: orderSummary.payment.currency,
      totalAmount: orderSummary.total.amount,
      totalCurrency: orderSummary.total.currency,
      itemsCount: Array.isArray(orderSummary.items) ? orderSummary.items.length : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  composeOrderItemRecord(orderSummary, profile, item, timestamp, index) {
    const itemId = normalizeString(item.id) || `${orderSummary.orderId || 'order'}-${index + 1}`;
    return {
      itemId,
      orderId: orderSummary.orderId,
      customerId: profile.customerId,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      promotions: Array.isArray(item.promotions) ? [...item.promotions] : [],
      position: item.position ?? index + 1,
      confirmedAt: orderSummary.confirmedAt,
      status: orderSummary.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  composePaymentRecord(orderSummary, profile, timestamp) {
    const payment = orderSummary.payment || {};
    return {
      paymentId: payment.id,
      orderId: orderSummary.orderId,
      customerId: profile.customerId,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      details: payment.raw,
      confirmedAt: orderSummary.confirmedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async upsertOrderRecord(profile, orderSummary, timestamp) {
    if (!orderSummary.orderId) {
      return;
    }

    const existing = await this.findOrderById(orderSummary.orderId);
    const record = this.composeOrderRecord(profile, orderSummary, timestamp);

    if (!existing) {
      await this.postCollectionItem(this.collections.orders, record);
      return;
    }

    record.createdAt = existing.value?.createdAt ?? record.createdAt;
    await this.putCollectionItem(this.collections.orders, existing.id, record);
  }

  async replaceOrderItems(orderSummary, profile, timestamp) {
    if (!orderSummary.orderId) {
      return;
    }

    const items = Array.isArray(orderSummary.items) ? orderSummary.items : [];
    const existingItems = await this.findOrderItemsByOrderId(orderSummary.orderId);

    for (const existing of existingItems) {
      await this.deleteCollectionItem(this.collections.orderItems, existing.id);
    }

    await Promise.all(
      items.map((item, index) =>
        this.postCollectionItem(
          this.collections.orderItems,
          this.composeOrderItemRecord(orderSummary, profile, item, timestamp, index),
        ),
      ),
    );
  }

  async upsertPaymentRecord(orderSummary, profile, timestamp) {
    const paymentId = orderSummary.payment?.id;
    if (!paymentId) {
      return;
    }

    const existing = await this.findPaymentById(paymentId);
    const record = this.composePaymentRecord(orderSummary, profile, timestamp);

    if (!existing) {
      await this.postCollectionItem(this.collections.orderPayments, record);
      return;
    }

    record.createdAt = existing.value?.createdAt ?? record.createdAt;
    await this.putCollectionItem(this.collections.orderPayments, existing.id, record);
  }

  async postCollectionItem(collection, record) {
    if (!collection) {
      return;
    }

    const url = new URL(`/collections/${collection.name}/items`, this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    });

    if (response.status !== 201) {
      const message = await parseErrorMessage(
        response,
        `No se pudo crear el registro en la colección ${collection.name}`,
      );
      throw new Error(message);
    }
  }

  async putCollectionItem(collection, id, record) {
    if (!collection || !id) {
      return;
    }

    const url = new URL(`/collections/${collection.name}/items/${id}`, this.nosqlUrl);
    const response = await this.fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    });

    if (response.status !== 200) {
      const message = await parseErrorMessage(
        response,
        `No se pudo actualizar el registro en la colección ${collection.name}`,
      );
      throw new Error(message);
    }
  }

  async deleteCollectionItem(collection, id) {
    if (!collection || !id) {
      return;
    }

    const url = new URL(`/collections/${collection.name}/items/${id}`, this.nosqlUrl);
    const response = await this.fetch(url, { method: 'DELETE' });

    if (response.status !== 200) {
      const message = await parseErrorMessage(
        response,
        `No se pudo eliminar el registro en la colección ${collection.name}`,
      );
      throw new Error(message);
    }
  }
}

module.exports = {
  CrmSyncProcessor,
  DEFAULT_COLLECTIONS,
  DEFAULT_COLLECTION,
  DEFAULT_EVENT_CHANNEL,
  DEFAULT_CONSUMER_NAME,
};
