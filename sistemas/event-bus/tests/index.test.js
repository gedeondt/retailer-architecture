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
  const log = api.createEventLog({ dataDir: tempDir });
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

  const service = await api.startEventBus({ dataDir: tempDir });
  assert.ok(service.log instanceof api.SimpleEventLog);
  assert.equal(typeof service.close, 'function');

  await service.log.append({ type: 'demo', payload: { value: 1 } });
  await service.close();
  const events = await service.log.listEvents();
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

  const response = await fetch(`${service.url}/events`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.items, []);
});

test('renderWidgetShell genera un fragmento HTML válido', () => {
  const html = api.renderWidgetShell({ apiOrigin: 'http://localhost:9999' });
  assert.ok(html.includes('data-widget-id="sistemas-event-bus"'));
  assert.ok(html.includes('data-api-origin="http://localhost:9999"'));
});
