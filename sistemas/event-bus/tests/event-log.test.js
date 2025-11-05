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

  const { channels = ['general'], ...logOptions } = options;
  const log = new SimpleEventLog({ dataDir: tempDir, channels, ...logOptions });
  await log.reset();
  return log;
}

test('append asigna identificadores secuenciales y persiste en disco', async (t) => {
  const timestamps = [
    new Date('2024-01-01T00:00:00.000Z'),
    new Date('2024-01-01T00:00:01.000Z'),
  ];
  const log = await createTempLog(t, { clock: () => timestamps.shift() ?? new Date('2024-01-01T00:00:59.000Z') });

  const first = await log.append({ channel: 'general', type: 'order.created', payload: { orderId: 'A-1' } });
  const second = await log.append({ channel: 'ventas', type: 'order.created', payload: { orderId: 'A-2' } });

  assert.equal(first.id, 1);
  assert.equal(second.id, 1);
  assert.equal(second.timestamp, '2024-01-01T00:00:01.000Z');
  assert.equal(first.channel, 'general');
  assert.equal(second.channel, 'ventas');

  const generalEventsFile = path.join(log.dataDir, 'channels', 'general.log');
  const salesEventsFile = path.join(log.dataDir, 'channels', 'ventas.log');
  const generalRaw = await fs.readFile(generalEventsFile, 'utf8');
  const salesRaw = await fs.readFile(salesEventsFile, 'utf8');

  const generalLines = generalRaw.trim().split('\n');
  assert.equal(generalLines.length, 1);
  assert.deepEqual(JSON.parse(generalLines[0]), first);

  const salesLines = salesRaw.trim().split('\n');
  assert.equal(salesLines.length, 1);
  assert.deepEqual(JSON.parse(salesLines[0]), second);
});

test('getEventsSince filtra eventos por offset', async (t) => {
  const log = await createTempLog(t);
  await log.append({ channel: 'general', type: 'order.created', payload: { orderId: 'A-1' } });
  await log.append({ channel: 'general', type: 'order.confirmed', payload: { orderId: 'A-1' } });
  await log.append({ channel: 'general', type: 'order.shipped', payload: { orderId: 'A-1' } });

  const events = await log.getEventsSince(1, { channel: 'general' });
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.type), ['order.confirmed', 'order.shipped']);
});

test('los canales operan de forma independiente', async (t) => {
  const log = await createTempLog(t, { channels: ['general', 'ventas'] });
  await log.append({ channel: 'general', type: 'general.event' });
  await log.append({ channel: 'ventas', type: 'ventas.event.1' });
  await log.append({ channel: 'ventas', type: 'ventas.event.2' });

  const generalEvents = await log.listEvents({ channel: 'general' });
  assert.equal(generalEvents.length, 1);
  assert.equal(generalEvents[0].channel, 'general');

  const salesEvents = await log.listEvents({ channel: 'ventas' });
  assert.equal(salesEvents.length, 2);
  assert.deepEqual(
    salesEvents.map((event) => ({ id: event.id, channel: event.channel })),
    [
      { id: 1, channel: 'ventas' },
      { id: 2, channel: 'ventas' },
    ]
  );

  const salesSince = await log.getEventsSince(1, { channel: 'ventas' });
  assert.equal(salesSince.length, 1);
  assert.equal(salesSince[0].id, 2);
});

test('createConsumer mantiene el offset y entrega nuevos eventos', async (t) => {
  const log = await createTempLog(t);
  await log.append({ channel: 'general', type: 'inventory.updated', payload: { sku: 'SKU-1' } });
  await log.append({ channel: 'general', type: 'inventory.updated', payload: { sku: 'SKU-2' } });

  const consumer = await log.createConsumer('inventory-worker', { channel: 'general' });
  const firstBatch = await consumer.poll();
  assert.equal(firstBatch.length, 2);

  const secondBatch = await consumer.poll();
  assert.equal(secondBatch.length, 0);

  await log.append({ channel: 'general', type: 'inventory.updated', payload: { sku: 'SKU-3' } });

  const thirdBatch = await consumer.poll();
  assert.equal(thirdBatch.length, 1);
  assert.equal(thirdBatch[0].payload.sku, 'SKU-3');
});

test('los consumidores se asocian a su canal correspondiente', async (t) => {
  const log = await createTempLog(t, { channels: ['ventas', 'logistica'] });
  await log.append({ channel: 'ventas', type: 'ventas.event.1' });
  await log.append({ channel: 'logistica', type: 'logistica.event.1' });

  const ventasWorker = await log.createConsumer('worker', { channel: 'ventas' });
  const logisticaWorker = await log.createConsumer('worker', { channel: 'logistica' });

  const ventasBatch = await ventasWorker.poll();
  const logisticaBatch = await logisticaWorker.poll();

  assert.equal(ventasBatch.length, 1);
  assert.equal(ventasBatch[0].channel, 'ventas');
  assert.equal(logisticaBatch.length, 1);
  assert.equal(logisticaBatch[0].channel, 'logistica');

  const ventasOffset = await ventasWorker.getOffset();
  const logisticaOffset = await logisticaWorker.getOffset();
  assert.equal(ventasOffset, 1);
  assert.equal(logisticaOffset, 1);
});

test('los consumidores persisten su offset entre instancias', async (t) => {
  const log = await createTempLog(t);

  await log.append({ channel: 'general', type: 'billing.invoiced', payload: { invoiceId: 'INV-1' } });
  await log.append({ channel: 'general', type: 'billing.invoiced', payload: { invoiceId: 'INV-2' } });

  const firstInstance = await log.createConsumer('facturacion', { channel: 'general' });
  const [firstEvent] = await firstInstance.poll({ limit: 1 });
  assert.equal(firstEvent.id, 1);

  const newInstance = await log.createConsumer('facturacion', { channel: 'general' });
  const nextBatch = await newInstance.poll();
  assert.equal(nextBatch.length, 1);
  assert.equal(nextBatch[0].id, 2);
});

test('poll permite controlar el offset manualmente con autoCommit=false', async (t) => {
  const log = await createTempLog(t);
  await log.append({ channel: 'general', type: 'support.ticket.opened', payload: { ticketId: 'T-1' } });
  await log.append({ channel: 'general', type: 'support.ticket.closed', payload: { ticketId: 'T-1' } });

  const consumer = await log.createConsumer('soporte', { channel: 'general' });
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
  await log.append({ channel: 'general', type: 'shipping.dispatched', payload: { orderId: 'O-1' } });
  const consumer = await log.createConsumer('logistica', { channel: 'general' });
  await consumer.poll();

  await log.reset();
  const events = await log.listEvents({ channel: 'general' });
  assert.equal(events.length, 0);

  const newBatch = await consumer.poll();
  assert.equal(newBatch.length, 0);
});

test('listConsumers devuelve los consumidores registrados con metadatos', async (t) => {
  const log = await createTempLog(t);
  const consumerA = await log.createConsumer('facturacion', { channel: 'general' });
  const consumerB = await log.createConsumer('logistica', { channel: 'general' });

  await consumerA.commit(2);
  await consumerB.reset();

  const consumers = await log.listConsumers({ channel: 'general' });
  assert.equal(consumers.length, 2);

  const names = consumers.map((item) => item.name).sort();
  assert.deepEqual(names, ['facturacion', 'logistica']);

  const billing = consumers.find((item) => item.name === 'facturacion');
  assert.equal(billing.offset, 2);
  assert.equal(billing.channel, 'general');
  assert.ok(typeof billing.updatedAt === 'string' && billing.updatedAt.length > 0);
  assert.ok(!Number.isNaN(Date.parse(billing.updatedAt)));

  const logistics = consumers.find((item) => item.name === 'logistica');
  assert.equal(logistics.offset, 0);
  assert.equal(logistics.channel, 'general');
});

test('EventConsumer#getOffset expone el offset persistido', async (t) => {
  const log = await createTempLog(t);
  const consumer = await log.createConsumer('atencion', { channel: 'general' });

  await log.append({ channel: 'general', type: 'ticket.created' });
  await consumer.poll();

  const offset = await consumer.getOffset();
  assert.equal(offset, 1);
});
