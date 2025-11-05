'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startNosqlService, renderWidgetShell } = require('../src/server');

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function rawRequest(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
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
  assert.match(widgetSource, /const \{ useEffect, useMemo, useRef, useState \} = React;/);
  assert.match(widgetSource, /root\.render\(<NosqlCollectionsWidget \/>\);/);
});

test('la API expone cabeceras CORS y responde preflight', async (t) => {
  const tempDir = await createTempDir('nosql-server-cors-');
  const { url, close } = await startNosqlService({ port: 0, dataDir: tempDir });

  t.after(async () => {
    await close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const origin = 'http://launcher.test';

  const widgetResponse = await rawRequest(new URL('/widget', url), { headers: { Origin: origin } });
  assert.equal(widgetResponse.statusCode, 200);
  assert.equal(widgetResponse.headers['access-control-allow-origin'], origin);
  assert.equal(widgetResponse.headers['vary'], 'Origin');

  const preflightResponse = await rawRequest(new URL('/collections', url), {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  assert.equal(preflightResponse.statusCode, 204);
  assert.equal(preflightResponse.headers['access-control-allow-origin'], origin);
  assert.equal(preflightResponse.headers['access-control-allow-methods'], 'GET,POST,PUT,DELETE,OPTIONS');
  assert.equal(preflightResponse.headers['access-control-allow-headers'], 'content-type');
});

test('renderWidgetShell genera un fragmento de widget listo para el navegador', () => {
  const html = renderWidgetShell({ apiOrigin: 'http://example.test:1234' });
  assert.match(html, /data-widget-id="sistemas-nosql-db"/);
  assert.match(html, /data-widget-size="1"/);
  assert.match(html, /data-api-origin="http:\/\/example\.test:1234"/);
  assert.match(html, /<script type="text\/babel" data-presets="react" src="\/widget\/client\.jsx"><\/script>/);
  assert.ok(!html.includes('<html'), 'no incluye el elemento html principal');
});
