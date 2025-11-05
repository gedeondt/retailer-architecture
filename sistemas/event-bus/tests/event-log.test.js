'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { SimpleEventLog } = require('../src/event-log');

async function createTempLog(t, options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const log = new SimpleEventLog({ dataDir: tempDir, ...options });
  await log.reset();
  return log;
}

test('append asigna identificadores secuenciales y persiste en disco', async (t) => {
  const timestamps = [
    new Date('2024-01-01T00:00:00.000Z'),
    new Date('2024-01-01T00:00:01.000Z'),
  ];
  const log = await createTempLog(t, { clock: () => timestamps.shift() ?? new Date('2024-01-01T00:00:59.000Z') });

  const first = await log.append({ type: 'order.created', payload: { orderId: 'A-1' } });
  const second = await log.append({ type: 'order.created', payload: { orderId: 'A-2' } });

  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.equal(second.timestamp, '2024-01-01T00:00:01.000Z');

  const eventsFile = path.join(log.dataDir, 'events.log');
  const raw = await fs.readFile(eventsFile, 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), first);
  assert.deepEqual(JSON.parse(lines[1]), second);
});

test('getEventsSince filtra eventos por offset', async (t) => {
  const log = await createTempLog(t);
  await log.append({ type: 'order.created', payload: { orderId: 'A-1' } });
  await log.append({ type: 'order.confirmed', payload: { orderId: 'A-1' } });
  await log.append({ type: 'order.shipped', payload: { orderId: 'A-1' } });

  const events = await log.getEventsSince(1);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.type), ['order.confirmed', 'order.shipped']);
});

test('createConsumer mantiene el offset y entrega nuevos eventos', async (t) => {
  const log = await createTempLog(t);
  await log.append({ type: 'inventory.updated', payload: { sku: 'SKU-1' } });
  await log.append({ type: 'inventory.updated', payload: { sku: 'SKU-2' } });

  const consumer = await log.createConsumer('inventory-worker');
  const firstBatch = await consumer.poll();
  assert.equal(firstBatch.length, 2);

  const secondBatch = await consumer.poll();
  assert.equal(secondBatch.length, 0);

  await log.append({ type: 'inventory.updated', payload: { sku: 'SKU-3' } });

  const thirdBatch = await consumer.poll();
  assert.equal(thirdBatch.length, 1);
  assert.equal(thirdBatch[0].payload.sku, 'SKU-3');
});

test('los consumidores persisten su offset entre instancias', async (t) => {
  const log = await createTempLog(t);

  await log.append({ type: 'billing.invoiced', payload: { invoiceId: 'INV-1' } });
  await log.append({ type: 'billing.invoiced', payload: { invoiceId: 'INV-2' } });

  const firstInstance = await log.createConsumer('facturacion');
  const [firstEvent] = await firstInstance.poll({ limit: 1 });
  assert.equal(firstEvent.id, 1);

  const newInstance = await log.createConsumer('facturacion');
  const nextBatch = await newInstance.poll();
  assert.equal(nextBatch.length, 1);
  assert.equal(nextBatch[0].id, 2);
});

test('poll permite controlar el offset manualmente con autoCommit=false', async (t) => {
  const log = await createTempLog(t);
  await log.append({ type: 'support.ticket.opened', payload: { ticketId: 'T-1' } });
  await log.append({ type: 'support.ticket.closed', payload: { ticketId: 'T-1' } });

  const consumer = await log.createConsumer('soporte');
  const batch = await consumer.poll({ limit: 1, autoCommit: false });
  assert.equal(batch.length, 1);

  // Al no hacer commit automático, la siguiente lectura debería devolver el mismo evento.
  const retryBatch = await consumer.poll({ limit: 1, autoCommit: false });
  assert.equal(retryBatch.length, 1);
  assert.equal(retryBatch[0].id, batch[0].id);

  await consumer.commit(batch[0].id);
  const finalBatch = await consumer.poll();
  assert.equal(finalBatch.length, 1);
  assert.equal(finalBatch[0].id, 2);
});

test('reset limpia el log y los offsets de consumidores', async (t) => {
  const log = await createTempLog(t);
  await log.append({ type: 'shipping.dispatched', payload: { orderId: 'O-1' } });
  const consumer = await log.createConsumer('logistica');
  await consumer.poll();

  await log.reset();
  const events = await log.listEvents();
  assert.equal(events.length, 0);

  const newBatch = await consumer.poll();
  assert.equal(newBatch.length, 0);
});
