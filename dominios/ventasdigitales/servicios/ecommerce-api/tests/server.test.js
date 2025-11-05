'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startCheckoutService } = require('../src/server');
const { DEFAULT_EVENT_CHANNEL } = require('../src/checkout-service');
const { startNosqlService } = require('../../../../../sistemas/nosql-db/src/server');
const { startEventBusService } = require('../../../../../sistemas/event-bus/src/server');

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('startCheckoutService expone POST /orders que persiste y publica el evento', async (t) => {
  const nosqlDir = await createTempDir('checkout-server-nosql-');
  const busDir = await createTempDir('checkout-server-bus-');

  const nosql = await startNosqlService({ port: 0, dataDir: nosqlDir });
  const eventBus = await startEventBusService({ port: 0, dataDir: busDir });
  const service = await startCheckoutService({ port: 0, nosqlUrl: nosql.url, eventBusUrl: eventBus.url });

  t.after(async () => {
    await service.close();
    await nosql.close();
    await eventBus.close();
    await fs.rm(nosqlDir, { recursive: true, force: true });
    await fs.rm(busDir, { recursive: true, force: true });
  });

  const payload = {
    customer: {
      firstName: 'Luis',
      lastName: 'Ramírez',
      email: 'luis@example.com',
    },
    payment: {
      method: 'credit_card',
      card: {
        holderName: 'Luis Ramírez',
        last4: '1881',
        brand: 'mastercard',
        expiryMonth: '08',
        expiryYear: '2031',
      },
      securityCodeProvided: false,
    },
    items: [{ sku: 'SKU-COFFEE-01', quantity: 1, price: 75.25 }],
    totalAmount: 75.25,
    currency: 'EUR',
    confirmedAt: '2024-06-01T09:30:00Z',
    channelOrigin: 'web',
  };

  const response = await fetch(new URL('/orders', service.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.ok(body.orderId);
  assert.equal(body.event.type, 'OrderConfirmed');
  assert.equal(body.event.payload.orderId, body.orderId);

  const eventsResponse = await fetch(
    new URL(`/events?channel=${encodeURIComponent(DEFAULT_EVENT_CHANNEL)}`, eventBus.url),
  );
  const events = await eventsResponse.json();
  assert.equal(events.items.length, 1);
  assert.equal(events.items[0].payload.orderId, body.orderId);
});

test('POST /orders rechaza cuerpos no JSON y responde CORS en preflight', async (t) => {
  const nosqlDir = await createTempDir('checkout-server-nosql-');
  const busDir = await createTempDir('checkout-server-bus-');

  const nosql = await startNosqlService({ port: 0, dataDir: nosqlDir });
  const eventBus = await startEventBusService({ port: 0, dataDir: busDir });
  const service = await startCheckoutService({ port: 0, nosqlUrl: nosql.url, eventBusUrl: eventBus.url });

  t.after(async () => {
    await service.close();
    await nosql.close();
    await eventBus.close();
    await fs.rm(nosqlDir, { recursive: true, force: true });
    await fs.rm(busDir, { recursive: true, force: true });
  });

  const preflight = await fetch(new URL('/orders', service.url), {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://launcher.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://launcher.test');
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'content-type');

  const invalid = await fetch(new URL('/orders', service.url), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'no-json',
  });
  assert.equal(invalid.status, 415);
});
