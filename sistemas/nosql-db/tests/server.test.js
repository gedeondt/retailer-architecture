'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startNosqlService, renderWidgetShell } = require('../src/server');

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('startNosqlService expone la API CRUD y de búsqueda', async (t) => {
  const tempDir = await createTempDir('nosql-server-');
  const { url, close } = await startNosqlService({ port: 0, dataDir: tempDir });

  t.after(async () => {
    await close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  let response = await fetch(new URL('/collections', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'clientes', indexField: 'email' }),
  });
  assert.equal(response.status, 201);

  response = await fetch(new URL('/collections/clientes/items', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@example.com', nombre: 'Ana' }),
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.ok(created.id);

  response = await fetch(new URL(`/collections/clientes/items/${created.id}`, url));
  assert.equal(response.status, 200);
  const fetched = await response.json();
  assert.equal(fetched.value.nombre, 'Ana');

  response = await fetch(new URL(`/collections/clientes/search?query=ana`, url));
  assert.equal(response.status, 200);
  const search = await response.json();
  assert.equal(search.totalItems, 1);

  response = await fetch(new URL(`/collections/clientes/items/${created.id}`, url), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@example.com', nombre: 'Ana Gómez' }),
  });
  assert.equal(response.status, 200);

  response = await fetch(new URL(`/collections/clientes/items/${created.id}`, url), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(response.status, 200);

  response = await fetch(new URL('/collections', url));
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.totalCollections, 1);
  assert.equal(summary.items[0].name, 'clientes');
  assert.equal(summary.items[0].itemCount, 0);

  response = await fetch(new URL('/widget/client.jsx', url));
  assert.equal(response.status, 200);
  const widgetSource = await response.text();
  assert.match(widgetSource, /<WidgetHeader/);
  assert.match(widgetSource, /<NosqlCollectionsWidget \/>/);
});

test('renderWidgetShell genera un fragmento de widget listo para React', () => {
  const html = renderWidgetShell({ apiOrigin: 'http://example.test:1234' });
  assert.match(html, /data-widget-id="sistemas-nosql-db"/);
  assert.match(html, /data-widget-size="1"/);
  assert.match(html, /data-api-origin="http:\/\/example\.test:1234"/);
  assert.match(html, /<script src="https:\/\/unpkg\.com\/react@18\/umd\/react\.development\.js"/);
  assert.match(html, /<script src="https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.development\.js"/);
  assert.match(html, /<script src="https:\/\/unpkg\.com\/@babel\/standalone@7\/babel\.min\.js"/);
  assert.match(html, /<script type="text\/babel" data-presets="react" src="\/widget\/client\.jsx"><\/script>/);
  assert.ok(!html.includes('<html'), 'no incluye el elemento html principal');
});
