'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const api = require('../src/index');

test('createEventLog expone una instancia de SimpleEventLog', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-index-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  assert.equal(typeof api.createEventLog, 'function');
  const log = api.createEventLog({ dataDir: tempDir, channels: ['general'] });
  assert.ok(log instanceof api.SimpleEventLog);
  await log.reset();
});

test('EventConsumer está disponible en la API pública', () => {
  assert.ok(api.EventConsumer, 'EventConsumer debe estar exportado');
});

test('startEventBus inicializa y devuelve un manejador con método close', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-bus-start-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const service = await api.startEventBus({ dataDir: tempDir, channels: ['general'] });
  assert.ok(service.log instanceof api.SimpleEventLog);
  assert.equal(typeof service.close, 'function');

  await service.log.append({ channel: 'general', type: 'demo', payload: { value: 1 } });
  await service.close();
  const events = await service.log.listEvents({ channel: 'general' });
  assert.equal(events.length, 0);
});

test('startEventBusService levanta el servidor HTTP y expone la URL', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-bus-http-'));
  const service = await api.startEventBusService({ dataDir: tempDir, port: 0 });
  t.after(async () => {
    await service.close();
  });
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  assert.ok(service.url.startsWith('http://'));
  assert.ok(service.log instanceof api.SimpleEventLog);

  const response = await fetch(`${service.url}/events?channel=general`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.items, []);
});

test('la API HTTP permite trabajar con canales específicos', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-bus-http-channels-'));
  const service = await api.startEventBusService({ dataDir: tempDir, port: 0 });
  t.after(async () => {
    await service.close();
  });
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const appendResponse = await fetch(`${service.url}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'ventas', type: 'order.created', payload: { orderId: 'V-1' } }),
  });
  assert.equal(appendResponse.status, 201);
  const appendBody = await appendResponse.json();
  assert.equal(appendBody.channel, 'ventas');
  assert.equal(appendBody.id, 1);

  const generalResponse = await fetch(`${service.url}/events?channel=general`);
  assert.equal(generalResponse.status, 200);
  const generalBody = await generalResponse.json();
  assert.deepEqual(generalBody.items, []);

  const salesResponse = await fetch(`${service.url}/events?channel=ventas`);
  assert.equal(salesResponse.status, 200);
  const salesBody = await salesResponse.json();
  assert.equal(salesBody.items.length, 1);
  assert.equal(salesBody.items[0].channel, 'ventas');

  const createConsumerResponse = await fetch(`${service.url}/consumers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ventas-worker', channel: 'ventas' }),
  });
  assert.equal(createConsumerResponse.status, 201);
  const consumerBody = await createConsumerResponse.json();
  assert.equal(consumerBody.channel, 'ventas');

  const pollResponse = await fetch(`${service.url}/consumers/${encodeURIComponent('ventas-worker')}/poll?channel=ventas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(pollResponse.status, 200);
  const pollBody = await pollResponse.json();
  assert.equal(pollBody.channel, 'ventas');
  assert.equal(pollBody.items.length, 1);
  assert.equal(pollBody.items[0].channel, 'ventas');
});

test('renderWidgetShell genera un fragmento HTML válido', () => {
  const html = api.renderWidgetShell({ apiOrigin: 'http://localhost:9999' });
  assert.ok(html.includes('data-widget-id="sistemas-event-bus"'));
  assert.ok(html.includes('data-api-origin="http://localhost:9999"'));
});
