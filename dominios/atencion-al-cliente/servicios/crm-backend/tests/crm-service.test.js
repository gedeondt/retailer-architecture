'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startNosqlService } = require('../../../../../sistemas/nosql-db/src/server');
const { startEventBusService } = require('../../../../../sistemas/event-bus/src/server');
const {
  CrmSyncProcessor,
  DEFAULT_COLLECTION,
  DEFAULT_COLLECTIONS,
  DEFAULT_EVENT_CHANNEL,
} = require('../src/crm-sync-processor');
const { startCrmService } = require('../src/server');

async function startInfrastructure(t) {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-nosql-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-eventbus-'));

  const nosql = await startNosqlService({ port: 0, host: '127.0.0.1', dataDir: nosqlDir });
  const eventBus = await startEventBusService({ port: 0, host: '127.0.0.1', dataDir: eventBusDir });

  t.after(async () => {
    await nosql.close();
    await eventBus.close();
    await fs.rm(nosqlDir, { recursive: true, force: true });
    await fs.rm(eventBusDir, { recursive: true, force: true });
  });

  return { nosql, eventBus };
}

async function publishOrderConfirmed(eventBusUrl, payload) {
  const response = await fetch(new URL('/events', eventBusUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: DEFAULT_EVENT_CHANNEL, type: 'OrderConfirmed', payload }),
  });
  assert.equal(response.status, 201, 'publica el evento OrderConfirmed');
}

function findBy(collectionItems, predicate) {
  return collectionItems.find((entry) => predicate(entry.value));
}

const ORDERS_COLLECTION = DEFAULT_COLLECTIONS.orders.name;
const ORDER_ITEMS_COLLECTION = DEFAULT_COLLECTIONS.orderItems.name;
const ORDER_PAYMENTS_COLLECTION = DEFAULT_COLLECTIONS.orderPayments.name;

test('CrmSyncProcessor crea y actualiza clientes y réplicas de pedidos a partir de eventos OrderConfirmed', async (t) => {
  const { nosql, eventBus } = await startInfrastructure(t);

  const processor = new CrmSyncProcessor({
    nosqlUrl: nosql.url,
    eventBusUrl: eventBus.url,
    collection: DEFAULT_COLLECTION,
    batchSize: 10,
    clock: () => new Date('2024-06-01T12:00:00.000Z'),
  });

  await processor.initialize();

  const firstEvent = {
    order: {
      id: 'ORDER-1',
      customerId: 'CUSTOMER-1',
      status: 'confirmed',
      channelOrigin: 'web',
      paymentIds: ['PAY-1'],
      confirmedAt: '2024-06-01T11:45:00.000Z',
      total: { amount: 630.49, currency: 'EUR' },
    },
    customer: {
      id: 'CUSTOMER-1',
      firstName: 'María',
      lastName: 'Fernández',
      email: 'maria@example.com',
      phone: '+34-600-123-456',
    },
    items: [
      {
        id: 'LINE-1',
        orderId: 'ORDER-1',
        sku: 'SKU-GUITAR-01',
        quantity: 1,
        unitPrice: 540.5,
        lineTotal: 540.5,
        promotions: ['PROMO-GUITAR'],
        position: 1,
      },
    ],
    payment: {
      id: 'PAY-1',
      orderId: 'ORDER-1',
      method: 'credit_card',
      amount: 630.49,
      currency: 'EUR',
      status: 'authorized',
    },
  };

  await publishOrderConfirmed(eventBus.url, firstEvent);

  const syncResult = await processor.syncPendingEvents();
  assert.equal(syncResult.processed, 1);
  assert.equal(syncResult.created, 1);

  const searchResponse = await fetch(
    new URL(`/collections/${DEFAULT_COLLECTION.name}/search?query=CUSTOMER-1`, nosql.url),
  );
  assert.equal(searchResponse.status, 200);
  const searchPayload = await searchResponse.json();
  assert.equal(searchPayload.items.length, 1, 'almacena la ficha del cliente');
  const customerRecord = searchPayload.items[0].value;
  assert.equal(customerRecord.customerId, 'CUSTOMER-1');
  assert.equal(customerRecord.firstName, 'María');
  assert.equal(customerRecord.lastOrderId, 'ORDER-1');
  assert.equal(customerRecord.orders.length, 1);
  assert.equal(customerRecord.orders[0].orderId, 'ORDER-1');
  assert.equal(customerRecord.orders[0].items.length, 1);

  const ordersSearchResponse = await fetch(
    new URL(`/collections/${ORDERS_COLLECTION}/search?query=ORDER-1`, nosql.url),
  );
  assert.equal(ordersSearchResponse.status, 200);
  const ordersSearchPayload = await ordersSearchResponse.json();
  assert.equal(ordersSearchPayload.items.length, 1, 'replica el pedido en la colección dedicada');
  const orderReplica = ordersSearchPayload.items[0].value;
  assert.equal(orderReplica.orderId, 'ORDER-1');
  assert.equal(orderReplica.customerId, 'CUSTOMER-1');
  assert.equal(orderReplica.paymentId, 'PAY-1');
  assert.equal(orderReplica.paymentMethod, 'credit_card');
  assert.equal(orderReplica.itemsCount, 1);

  const itemsListResponse = await fetch(
    new URL(`/collections/${ORDER_ITEMS_COLLECTION}/items?page=1&pageSize=10`, nosql.url),
  );
  assert.equal(itemsListResponse.status, 200);
  const itemsListPayload = await itemsListResponse.json();
  assert.equal(itemsListPayload.totalItems, 1, 'replica los ítems del pedido');
  const replicatedItem = itemsListPayload.items[0].value;
  assert.equal(replicatedItem.itemId, 'LINE-1');
  assert.equal(replicatedItem.orderId, 'ORDER-1');
  assert.equal(replicatedItem.sku, 'SKU-GUITAR-01');

  const paymentsSearchResponse = await fetch(
    new URL(`/collections/${ORDER_PAYMENTS_COLLECTION}/search?query=PAY-1`, nosql.url),
  );
  assert.equal(paymentsSearchResponse.status, 200);
  const paymentsSearchPayload = await paymentsSearchResponse.json();
  assert.equal(paymentsSearchPayload.items.length, 1, 'replica el pago del pedido');
  const replicatedPayment = paymentsSearchPayload.items[0].value;
  assert.equal(replicatedPayment.paymentId, 'PAY-1');
  assert.equal(replicatedPayment.orderId, 'ORDER-1');
  assert.equal(replicatedPayment.method, 'credit_card');

  const secondEvent = {
    order: {
      id: 'ORDER-2',
      customerId: 'CUSTOMER-1',
      status: 'confirmed',
      channelOrigin: 'app',
      paymentIds: ['PAY-2'],
      confirmedAt: '2024-06-02T10:00:00.000Z',
      total: { amount: 120, currency: 'EUR' },
    },
    customer: {
      id: 'CUSTOMER-1',
      firstName: 'María',
      lastName: 'Fernández',
      email: 'maria.actualizada@example.com',
      phone: '+34-600-123-456',
    },
    items: [
      {
        id: 'LINE-2',
        orderId: 'ORDER-2',
        sku: 'SKU-STRAP',
        quantity: 2,
        unitPrice: 60,
        lineTotal: 120,
        position: 1,
      },
    ],
    payment: {
      id: 'PAY-2',
      orderId: 'ORDER-2',
      method: 'paypal',
      amount: 120,
      currency: 'EUR',
      status: 'captured',
    },
  };

  await publishOrderConfirmed(eventBus.url, secondEvent);

  const syncResultUpdate = await processor.syncPendingEvents();
  assert.equal(syncResultUpdate.processed, 1);
  assert.equal(syncResultUpdate.updated, 1);

  const refreshedResponse = await fetch(
    new URL(`/collections/${DEFAULT_COLLECTION.name}/search?query=CUSTOMER-1`, nosql.url),
  );
  assert.equal(refreshedResponse.status, 200);
  const refreshedPayload = await refreshedResponse.json();
  assert.equal(refreshedPayload.items.length, 1);
  const refreshedRecord = refreshedPayload.items[0].value;

  assert.equal(refreshedRecord.email, 'maria.actualizada@example.com', 'actualiza los datos del cliente');
  assert.equal(refreshedRecord.orders.length, 2, 'agrega el nuevo pedido al historial');
  assert.deepEqual(
    refreshedRecord.orders.map((order) => order.orderId).sort(),
    ['ORDER-1', 'ORDER-2'],
  );
  assert.equal(refreshedRecord.lastOrderId, 'ORDER-2');
  assert.equal(refreshedRecord.lastOrder.payment.method, 'paypal');

  const ordersListResponse = await fetch(
    new URL(`/collections/${ORDERS_COLLECTION}/items?page=1&pageSize=10`, nosql.url),
  );
  assert.equal(ordersListResponse.status, 200);
  const ordersListPayload = await ordersListResponse.json();
  assert.equal(ordersListPayload.totalItems, 2, 'almacena ambos pedidos en la colección dedicada');
  const orderTwoReplica = findBy(ordersListPayload.items, (value) => value.orderId === 'ORDER-2');
  assert.ok(orderTwoReplica, 'existe la réplica del segundo pedido');
  assert.equal(orderTwoReplica.value.paymentMethod, 'paypal');
  assert.equal(orderTwoReplica.value.totalAmount, 120);

  const paymentListResponse = await fetch(
    new URL(`/collections/${ORDER_PAYMENTS_COLLECTION}/items?page=1&pageSize=10`, nosql.url),
  );
  assert.equal(paymentListResponse.status, 200);
  const paymentListPayload = await paymentListResponse.json();
  assert.equal(paymentListPayload.totalItems, 2, 'replica cada pago de los pedidos');
  const secondPaymentReplica = findBy(paymentListPayload.items, (value) => value.paymentId === 'PAY-2');
  assert.ok(secondPaymentReplica, 'almacena el pago del segundo pedido');
  assert.equal(secondPaymentReplica.value.status, 'captured');

  const stats = processor.getStats();
  assert.ok(stats.lastSyncAt, 'registra la fecha de la última sincronización');
  assert.equal(stats.totalCustomersCreated, 1);
  assert.equal(stats.totalCustomersUpdated, 1);
  assert.equal(stats.totalEventsProcessed, 2);
});

test('startCrmService expone endpoints HTTP para controlar la sincronización', async (t) => {
  const { nosql, eventBus } = await startInfrastructure(t);

  const { url, close } = await startCrmService({
    port: 0,
    host: '127.0.0.1',
    nosqlUrl: nosql.url,
    eventBusUrl: eventBus.url,
    pollIntervalMs: 0,
  });

  t.after(close);

  const healthResponse = await fetch(new URL('/health', url));
  assert.equal(healthResponse.status, 200);
  const healthPayload = await healthResponse.json();
  assert.equal(healthPayload.status, 'ok');

  await publishOrderConfirmed(eventBus.url, {
    order: {
      id: 'ORDER-HTTP-1',
      customerId: 'CUSTOMER-HTTP-1',
      status: 'confirmed',
      channelOrigin: 'web',
      paymentIds: ['PAY-HTTP-1'],
      confirmedAt: '2024-06-03T10:00:00.000Z',
      total: { amount: 200, currency: 'EUR' },
    },
    customer: {
      id: 'CUSTOMER-HTTP-1',
      firstName: 'Lucía',
      lastName: 'Pérez',
      email: 'lucia@example.com',
    },
    items: [
      {
        id: 'LINE-HTTP-1',
        orderId: 'ORDER-HTTP-1',
        sku: 'SKU-HEADPHONES',
        quantity: 1,
        unitPrice: 200,
        lineTotal: 200,
      },
    ],
    payment: {
      id: 'PAY-HTTP-1',
      orderId: 'ORDER-HTTP-1',
      method: 'credit_card',
      amount: 200,
      currency: 'EUR',
      status: 'authorized',
    },
  });

  const triggerResponse = await fetch(new URL('/tasks/sync', url), { method: 'POST' });
  assert.equal(triggerResponse.status, 200);
  const triggerPayload = await triggerResponse.json();
  assert.equal(triggerPayload.status, 'completed');
  assert.equal(triggerPayload.result.processed, 1);

  const lookupResponse = await fetch(
    new URL(`/collections/${DEFAULT_COLLECTION.name}/search?query=CUSTOMER-HTTP-1`, nosql.url),
  );
  assert.equal(lookupResponse.status, 200);
  const lookupPayload = await lookupResponse.json();
  assert.equal(lookupPayload.items.length, 1, 'crea el cliente a partir de la sincronización manual');

  await publishOrderConfirmed(eventBus.url, {
    order: {
      id: 'ORDER-HTTP-2',
      customerId: 'CUSTOMER-HTTP-1',
      status: 'preparing',
      channelOrigin: 'contact_center',
      paymentIds: ['PAY-HTTP-2'],
      confirmedAt: '2024-06-03T14:00:00.000Z',
      total: { amount: 120, currency: 'EUR' },
    },
    customer: {
      id: 'CUSTOMER-HTTP-1',
      firstName: 'Lucía',
      lastName: 'Pérez',
      email: 'lucia@example.com',
    },
    items: [
      {
        id: 'LINE-HTTP-2',
        orderId: 'ORDER-HTTP-2',
        sku: 'SKU-STRINGS',
        quantity: 3,
        unitPrice: 40,
        lineTotal: 120,
      },
    ],
    payment: {
      id: 'PAY-HTTP-2',
      orderId: 'ORDER-HTTP-2',
      method: 'credit_card',
      amount: 120,
      currency: 'EUR',
      status: 'captured',
    },
  });

  const syncAgainResponse = await fetch(new URL('/tasks/sync', url), { method: 'POST' });
  assert.equal(syncAgainResponse.status, 200);

  const entitiesResponse = await fetch(new URL('/entities', url));
  assert.equal(entitiesResponse.status, 200);
  const entitiesPayload = await entitiesResponse.json();
  assert.ok(Array.isArray(entitiesPayload.items));
  assert.equal(entitiesPayload.totalEntities, 4, 'exponen todas las entidades autosuficientes');
  const entityIds = entitiesPayload.items.map((entry) => entry.id).sort();
  assert.deepEqual(entityIds, ['crm-customers', 'crm-order-items', 'crm-order-payments', 'crm-orders']);
  const customerEntity = entitiesPayload.items.find((entry) => entry.id === 'crm-customers');
  assert.ok(customerEntity, 'exponen la entidad de clientes');
  assert.equal(customerEntity.fields.length, 4, 'cada entidad define columnas relevantes');

  const customersResponse = await fetch(new URL('/entities/crm-customers?page=1&pageSize=5', url));
  assert.equal(customersResponse.status, 200);
  const customersPayload = await customersResponse.json();
  assert.equal(customersPayload.totalItems, 1);
  assert.deepEqual(
    customersPayload.entity.fields.map((field) => field.key),
    ['customerId', 'fullName', 'email', 'lastOrderStatus'],
  );
  const customerRow = customersPayload.items[0];
  assert.equal(customerRow.customerId, 'CUSTOMER-HTTP-1');
  assert.equal(customerRow.fullName, 'Lucía Pérez');

  const ordersResponse = await fetch(new URL('/entities/crm-orders?page=1&pageSize=10', url));
  assert.equal(ordersResponse.status, 200);
  const ordersPayload = await ordersResponse.json();
  assert.ok(ordersPayload.totalItems >= 2, 'agrega los pedidos sincronizados');
  assert.deepEqual(
    ordersPayload.entity.fields.map((field) => field.key),
    [
      'orderId',
      'customerId',
      'status',
      'channelOrigin',
      'confirmedAt',
      'totalAmount',
      'totalCurrency',
      'paymentMethod',
      'paymentStatus',
    ],
  );
  const orderIds = ordersPayload.items.map((item) => item.orderId);
  assert.ok(orderIds.includes('ORDER-HTTP-1'));
  assert.ok(orderIds.includes('ORDER-HTTP-2'));
  const orderRow = ordersPayload.items.find((item) => item.orderId === 'ORDER-HTTP-2');
  assert.equal(orderRow.paymentStatus, 'captured');

  const orderItemsResponse = await fetch(new URL('/entities/crm-order-items?page=1&pageSize=10', url));
  assert.equal(orderItemsResponse.status, 200);
  const orderItemsPayload = await orderItemsResponse.json();
  assert.ok(orderItemsPayload.totalItems >= 2, 'expone los ítems replicados');
  assert.deepEqual(
    orderItemsPayload.entity.fields.map((field) => field.key),
    ['itemId', 'orderId', 'customerId', 'sku', 'quantity', 'unitPrice', 'lineTotal', 'promotions'],
  );
  const itemRow = orderItemsPayload.items.find((item) => item.orderId === 'ORDER-HTTP-2');
  assert.equal(itemRow.sku, 'SKU-STRINGS');
  assert.equal(itemRow.quantity, 3);

  const paymentsResponse = await fetch(new URL('/entities/crm-order-payments?page=1&pageSize=10', url));
  assert.equal(paymentsResponse.status, 200);
  const paymentsPayload = await paymentsResponse.json();
  assert.ok(paymentsPayload.totalItems >= 2, 'expone los pagos sincronizados');
  assert.deepEqual(
    paymentsPayload.entity.fields.map((field) => field.key),
    ['paymentId', 'orderId', 'customerId', 'method', 'status', 'amount', 'currency'],
  );
  const paymentRow = paymentsPayload.items.find((item) => item.paymentId === 'PAY-HTTP-2');
  assert.equal(paymentRow.status, 'captured');
  assert.equal(paymentRow.amount, 120);

  const invalidEntityResponse = await fetch(new URL('/entities/unknown', url));
  assert.equal(invalidEntityResponse.status, 404);
});
