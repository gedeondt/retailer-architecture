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

test('CrmSyncProcessor crea y actualiza clientes a partir de eventos OrderConfirmed', async (t) => {
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

  const secondEvent = {
    order: {
      id: 'ORDER-2',
      customerId: 'CUSTOMER-1',
      status: 'confirmed',
      channelOrigin: 'app',
      paymentIds: ['PAY-2'],
      confirmedAt: '2024-06-02T09:15:00.000Z',
      total: { amount: 120.0, currency: 'EUR' },
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
    items: [],
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
});
