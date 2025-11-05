'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startLauncher } = require('../launcher');

test('startLauncher sirve el dashboard y sus páginas principales', async (t) => {
  const { url, close } = await startLauncher({ port: 0, startSystems: false });
  t.after(close);

  const homeResponse = await fetch(url);
  assert.equal(homeResponse.status, 200);
  const homeBody = await homeResponse.text();
  assert.match(homeBody, /Launcher Retailer/);
  assert.match(homeBody, /Vista 4 columnas/);

  const dominiosResponse = await fetch(new URL('/dominios.html', url));
  assert.equal(dominiosResponse.status, 200);
  const dominiosBody = await dominiosResponse.text();
  assert.match(dominiosBody, /Widgets por dominio/);

  const sistemasResponse = await fetch(new URL('/sistemas.html', url));
  assert.equal(sistemasResponse.status, 200);
  const sistemasBody = await sistemasResponse.text();
  assert.match(sistemasBody, /Sistemas transversales/);
});

test('startLauncher inicia los sistemas compartidos y expone su configuración', async (t) => {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-nosql-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-eventbus-'));

  const { url, close, systems } = await startLauncher({
    port: 0,
    systemsConfig: {
      nosqlDb: { port: 0, host: '127.0.0.1', dataDir: nosqlDir },
      eventBus: { port: 0, host: '127.0.0.1', dataDir: eventBusDir },
    },
  });

  t.after(async () => {
    await close();
    await fs.rm(nosqlDir, { recursive: true, force: true });
    await fs.rm(eventBusDir, { recursive: true, force: true });
  });

  assert.ok(systems.nosql, 'se obtiene la instancia del servicio NoSQL');
  assert.ok(systems.eventBus, 'se obtiene la instancia del servicio Event Bus');

  const nosqlResponse = await fetch(new URL('/collections', systems.nosql.url));
  assert.equal(nosqlResponse.status, 200);
  const nosqlPayload = await nosqlResponse.json();
  assert.deepEqual(nosqlPayload.items, []);

  const eventBusResponse = await fetch(new URL('/overview', systems.eventBus.url));
  assert.equal(eventBusResponse.status, 200);
  const eventBusPayload = await eventBusResponse.json();
  assert.equal(eventBusPayload.totalEvents, 0);

  const dashboardResponse = await fetch(new URL('/sistemas.html', url));
  assert.equal(dashboardResponse.status, 200);
  const dashboardBody = await dashboardResponse.text();
  assert.ok(
    dashboardBody.includes(`"widgetOrigin":"${systems.nosql.url}`),
    'expone el widget del servicio NoSQL',
  );
  assert.ok(
    dashboardBody.includes(`"widgetOrigin":"${systems.eventBus.url}`),
    'expone el widget del Event Bus',
  );
});

test('startLauncher utiliza el puerto 3000 por defecto', async (t) => {
  const { url, close } = await startLauncher({ startSystems: false });
  t.after(close);

  assert.match(url, /:3000\//);
});
