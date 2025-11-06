'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { CheckoutProcessor, CheckoutError, DEFAULT_EVENT_CHANNEL } = require('../src/checkout-service');
const { startNosqlService } = require('../../../../../sistemas/nosql-db/src/server');
const { startEventBusService } = require('../../../../../sistemas/event-bus/src/server');

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('CheckoutProcessor persiste el pedido y publica OrderConfirmed', async (t) => {
  const nosqlDir = await createTempDir('checkout-nosql-');
  const busDir = await createTempDir('checkout-bus-');

  const nosql = await startNosqlService({ port: 0, dataDir: nosqlDir });
  const eventBus = await startEventBusService({ port: 0, dataDir: busDir });

  t.after(async () => {
    await nosql.close();
    await eventBus.close();
    await fs.rm(nosqlDir, { recursive: true, force: true });
    await fs.rm(busDir, { recursive: true, force: true });
  });

  const processor = new CheckoutProcessor({ nosqlUrl: nosql.url, eventBusUrl: eventBus.url });
  await processor.initialize();

  const payload = {
    customer: {
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      phone: '+34 600 000 000',
    },
    payment: {
      method: 'credit_card',
      card: {
        holderName: 'Ana Pérez',
        last4: '4242',
        brand: 'visa',
        expiryMonth: '04',
        expiryYear: '2030',
      },
      securityCodeProvided: true,
    },
    items: [
      { sku: 'SKU-ACOUSTIC-01', quantity: 2, price: 89.99 },
      { sku: 'SKU-SMARTWATCH-01', quantity: 1, price: 149.5 },
    ],
    totalAmount: 329.48,
    currency: 'EUR',
    confirmedAt: '2024-04-05T10:20:00Z',
    channelOrigin: 'web',
  };

  const result = await processor.processOrder(payload);

  assert.ok(result.orderId);
  assert.ok(result.customerId);
  assert.ok(result.paymentId);
  assert.equal(typeof result.eventRecord, 'object');
  assert.equal(result.eventRecord.type, 'OrderConfirmed');
  assert.equal(result.eventRecord.channel, DEFAULT_EVENT_CHANNEL);
  const eventPayload = result.eventRecord.payload;
  assert.equal(eventPayload.order.id, result.orderId);
  assert.equal(eventPayload.order.customerId, result.customerId);
  assert.equal(eventPayload.order.channelOrigin, payload.channelOrigin);
  assert.ok(eventPayload.order.paymentIds.includes(result.paymentId));
  assert.equal(eventPayload.order.total.amount, payload.totalAmount);
  assert.equal(eventPayload.order.total.currency, payload.currency);
  assert.equal(eventPayload.customer.id, result.customerId);
  assert.equal(eventPayload.customer.email, payload.customer.email);
  assert.equal(eventPayload.payment.id, result.paymentId);
  assert.equal(eventPayload.payment.method, payload.payment.method);
  assert.equal(eventPayload.payment.amount, payload.totalAmount);
  assert.equal(eventPayload.payment.card.brand, payload.payment.card.brand);
  assert.equal(eventPayload.payment.card.last4, payload.payment.card.last4);
  assert.equal(eventPayload.payment.securityCodeProvided, payload.payment.securityCodeProvided);
  assert.equal(eventPayload.items.length, payload.items.length);
  assert.deepEqual(
    eventPayload.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
    payload.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
  );
  assert.equal(eventPayload.items[0].unitPrice, payload.items[0].price);

  const ordersResponse = await fetch(
    new URL(`/collections/digital-orders/items?page=1&pageSize=10`, nosql.url),
  );
  assert.equal(ordersResponse.status, 200);
  const orders = await ordersResponse.json();
  assert.equal(orders.totalItems, 1);
  assert.equal(orders.items[0].value.pedidoId, result.orderId);
  assert.equal(orders.items[0].value.estado, 'confirmado');

  const linesResponse = await fetch(
    new URL(`/collections/digital-order-lines/items?page=1&pageSize=10`, nosql.url),
  );
  assert.equal(linesResponse.status, 200);
  const lines = await linesResponse.json();
  assert.equal(lines.totalItems, payload.items.length);
  assert.equal(lines.items[0].value.pedidoId, result.orderId);

  const paymentsResponse = await fetch(
    new URL(`/collections/digital-order-payments/items?page=1&pageSize=10`, nosql.url),
  );
  assert.equal(paymentsResponse.status, 200);
  const payments = await paymentsResponse.json();
  assert.equal(payments.totalItems, 1);
  assert.equal(payments.items[0].value.pagoId, result.paymentId);
  assert.equal(payments.items[0].value.metodo, payload.payment.method);

  const eventsResponse = await fetch(
    new URL(`/events?channel=${encodeURIComponent(DEFAULT_EVENT_CHANNEL)}`, eventBus.url),
  );
  assert.equal(eventsResponse.status, 200);
  const events = await eventsResponse.json();
  assert.equal(events.items.length, 1);
  assert.equal(events.items[0].type, 'OrderConfirmed');
  const storedPayload = events.items[0].payload;
  assert.equal(storedPayload.order.id, result.orderId);
  assert.equal(storedPayload.customer.id, result.customerId);
  assert.equal(storedPayload.payment.id, result.paymentId);
  assert.equal(storedPayload.items.length, payload.items.length);
});

test('CheckoutProcessor rechaza pedidos sin ítems', async () => {
  const processor = new CheckoutProcessor({
    fetchImpl: () => {
      throw new Error('No debería invocar fetch para pedidos inválidos');
    },
  });

  await assert.rejects(
    processor.processOrder({
      customer: { firstName: 'Ana' },
      payment: { method: 'card', card: {} },
      items: [],
      totalAmount: 10,
      currency: 'EUR',
    }),
    (error) => error instanceof CheckoutError && /al menos un ítem/i.test(error.message),
  );
});
