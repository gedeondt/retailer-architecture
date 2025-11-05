'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startLauncher, createDashboardHTML } = require('./launcher');

test('createDashboardHTML lee la página principal desde el sistema de archivos', () => {
  const html = createDashboardHTML();
  assert.ok(html.includes('Panel maestro de microfrontends'), 'la cabecera del dashboard está presente');
  assert.ok(html.includes('data-widget-id="ventas-pedidos"'), 'incluye widget de pedidos');
  assert.ok(html.includes('data-widget-size="4"'), 'muestra widgets panorámicos de 4 columnas');
  assert.ok(html.includes('href="/dominios.html"'), 'el menú enlaza a la página de dominios');
  assert.ok(!html.includes('href="#dominios"'), 'el menú ya no usa anclas internas');
});

test('startLauncher sirve páginas independientes para cada sección', async (t) => {
  const { url, close } = await startLauncher({ port: 0, startSystems: false });
  t.after(close);

  const homeResponse = await fetch(url);
  assert.equal(homeResponse.status, 200);
  const homeBody = await homeResponse.text();
  assert.match(homeBody, /Launcher Retailer/);
  assert.match(homeBody, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);

  const dominiosResponse = await fetch(new URL('/dominios.html', url));
  assert.equal(dominiosResponse.status, 200);
  const dominiosBody = await dominiosResponse.text();
  assert.match(dominiosBody, /Widgets por dominio/);
  assert.match(dominiosBody, /Ver catálogo/);

  const sistemasResponse = await fetch(new URL('/sistemas.html', url));
  assert.equal(sistemasResponse.status, 200);
  const sistemasBody = await sistemasResponse.text();
  assert.match(sistemasBody, /Sistemas transversales/);
  assert.match(sistemasBody, /id="nosql-db-widget-slot"/);
  assert.match(sistemasBody, /Cargando widget NoSQL…/);
  assert.match(sistemasBody, /id="event-bus-widget-slot"/);
  assert.match(sistemasBody, /Cargando widget Event Bus…/);
});

test('startLauncher inyecta la configuración de los widgets de sistemas en la página', async (t) => {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-nosql-config-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-eventbus-config-'));
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

  const response = await fetch(new URL('/sistemas.html', url));
  assert.equal(response.status, 200);
  const body = await response.text();

  assert.ok(body.includes('window.__LAUNCHER_CONFIG__'), 'se inyecta la configuración global');
  assert.ok(
    body.includes(`"widgetOrigin":"${systems.nosql.url}`),
    'se expone el origen del widget NoSQL',
  );
  assert.ok(
    body.includes(`"apiOrigin":"${systems.nosql.url}`),
    'se expone el origen de la API de NoSQL',
  );
  assert.ok(systems.eventBus, 'se obtiene la instancia del servicio Event Bus');
  assert.ok(
    body.includes(`"widgetOrigin":"${systems.eventBus.url}`),
    'se expone el origen del widget Event Bus',
  );
  assert.ok(
    body.includes(`"apiOrigin":"${systems.eventBus.url}`),
    'se expone el origen de la API del Event Bus',
  );
});

test('startLauncher utiliza el puerto 3000 por defecto', async (t) => {
  const { url, close } = await startLauncher({ startSystems: false });
  t.after(close);

  assert.match(url, /:3000\//);
});

test('startLauncher inicia el servicio NoSQL por defecto', async (t) => {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-nosql-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-eventbus-'));
  const { close, systems } = await startLauncher({
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

  const response = await fetch(new URL('/collections', systems.nosql.url));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.items, []);
  assert.equal(payload.totalCollections, 0);
  assert.ok(payload.storage);
  assert.equal(payload.storage.usedBytes, 0);
});

test('startLauncher inicia el servicio Event Bus por defecto', async (t) => {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-nosql-eventbus-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-eventbus-'));
  const { close, systems } = await startLauncher({
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

  assert.ok(systems.eventBus, 'se obtiene la instancia del servicio Event Bus');

  const response = await fetch(new URL('/overview', systems.eventBus.url));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.totalEvents, 0);
  assert.deepEqual(payload.recentEvents, []);
});
