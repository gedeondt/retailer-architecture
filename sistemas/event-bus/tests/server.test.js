'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startEventBusService } = require('../src/server');

async function createService(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-bus-service-'));

  const service = await startEventBusService({ dataDir, port: 0 });
  t.after(async () => {
    await service.close();
  });
  t.after(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  return service;
}

function urlFor(service, path) {
  return new URL(path, service.url).toString();
}

test('la API permite publicar eventos y consultarlos', async (t) => {
  const service = await createService(t);

  const listResponse = await fetch(urlFor(service, '/events?channel=general'));
  assert.equal(listResponse.status, 200);
  const emptyPayload = await listResponse.json();
  assert.deepEqual(emptyPayload.items, []);

  const createResponse = await fetch(urlFor(service, '/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'general', type: 'pedido.creado', payload: { id: 'P-1' } }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.id, 1);
  assert.equal(created.type, 'pedido.creado');

  const sinceResponse = await fetch(urlFor(service, '/events?channel=general&since=0'));
  assert.equal(sinceResponse.status, 200);
  const sincePayload = await sinceResponse.json();
  assert.equal(sincePayload.items.length, 1);
  assert.equal(sincePayload.items[0].payload.id, 'P-1');
});

test('gestiona consumidores con poll, commit y reset', async (t) => {
  const service = await createService(t);

  await fetch(urlFor(service, '/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'general', type: 'demo', payload: { value: 1 } }),
  });
  await fetch(urlFor(service, '/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'general', type: 'demo', payload: { value: 2 } }),
  });

  const createConsumer = await fetch(urlFor(service, '/consumers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'orquestador', channel: 'general' }),
  });
  assert.equal(createConsumer.status, 201);

  const pollResponse = await fetch(urlFor(service, '/consumers/orquestador/poll?channel=general'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1, autoCommit: false }),
  });
  assert.equal(pollResponse.status, 200);
  const pollPayload = await pollResponse.json();
  assert.equal(pollPayload.items.length, 1);
  assert.equal(pollPayload.items[0].id, 1);
  assert.equal(pollPayload.committedOffset, 0);

  const commitResponse = await fetch(urlFor(service, '/consumers/orquestador/commit?channel=general'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lastEventId: pollPayload.items[0].id }),
  });
  assert.equal(commitResponse.status, 200);
  const commitPayload = await commitResponse.json();
  assert.equal(commitPayload.offset, 1);

  const pollAgain = await fetch(urlFor(service, '/consumers/orquestador/poll?channel=general'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(pollAgain.status, 200);
  const pollAgainPayload = await pollAgain.json();
  assert.equal(pollAgainPayload.items.length, 1);
  assert.equal(pollAgainPayload.committedOffset, 2);

  const resetResponse = await fetch(urlFor(service, '/consumers/orquestador/reset?channel=general'), {
    method: 'POST',
  });
  assert.equal(resetResponse.status, 200);
  const resetPayload = await resetResponse.json();
  assert.equal(resetPayload.offset, 0);
});

test('overview agrega métricas y refleja consumidores y eventos', async (t) => {
  const service = await createService(t);

  await fetch(urlFor(service, '/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'general', type: 'pedido.creado', payload: { id: 'P-99' } }),
  });

  await fetch(urlFor(service, '/consumers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'facturacion', channel: 'general' }),
  });

  const overviewResponse = await fetch(urlFor(service, '/overview?channel=general'));
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json();
  assert.equal(overview.totalEvents, 1);
  assert.equal(overview.highWatermark, 1);
  assert.equal(overview.recentEvents.length, 1);
  assert.equal(overview.consumers.length, 1);
  assert.equal(overview.consumers[0].name, 'facturacion');
});

test('sirve el widget HTML y el cliente React', async (t) => {
  const service = await createService(t);

  const widgetResponse = await fetch(urlFor(service, '/widget?apiOrigin=http://demo')); 
  assert.equal(widgetResponse.status, 200);
  const widgetHtml = await widgetResponse.text();
  assert.ok(widgetHtml.includes('data-widget-id="sistemas-event-bus"'));
  assert.ok(widgetHtml.includes('data-api-origin="http://demo"'));

  const clientResponse = await fetch(urlFor(service, '/widget/client.jsx'));
  assert.equal(clientResponse.status, 200);
  const clientSource = await clientResponse.text();
  assert.ok(clientSource.includes('EventBusWidget'));
});
