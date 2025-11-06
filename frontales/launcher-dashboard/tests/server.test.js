'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { startDashboardServer, createDashboardHTML } = require('../src/server');

test('createDashboardHTML lee la página principal desde el sistema de archivos', () => {
  const html = createDashboardHTML();
  assert.ok(html.includes('Panel maestro de microfrontends'), 'la cabecera del dashboard está presente');
  assert.ok(html.includes('data-widget-id="ventas-pedidos"'), 'incluye widget de pedidos');
  assert.ok(html.includes('data-widget-size="4"'), 'muestra widgets panorámicos de 4 columnas');
  assert.ok(
    html.includes('data-dashboard-include="header"'),
    'incluye el marcador para insertar el header compartido',
  );
  assert.ok(
    html.includes('data-dashboard-include="footer"'),
    'incluye el marcador para insertar el footer reutilizable',
  );
});

test('startDashboardServer sirve páginas independientes para cada sección', async (t) => {
  const { url, close } = await startDashboardServer({ port: 0 });
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
  assert.match(sistemasBody, /data-channel="general"/);
});

test('startDashboardServer inyecta la configuración de los widgets cuando se proporcionan sistemas', async (t) => {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-nosql-config-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-eventbus-config-'));
  const runtimeSystems = {
    nosql: { url: 'http://127.0.0.1:5001' },
    eventBus: { url: 'http://127.0.0.1:5002' },
  };

  const { url, close } = await startDashboardServer({
    port: 0,
    runtimeSystems,
    systemsConfig: {
      nosqlDb: { apiOrigin: 'http://127.0.0.1:6001', dataDir: nosqlDir },
      eventBus: { apiOrigin: 'http://127.0.0.1:6002', dataDir: eventBusDir, channel: 'ventas' },
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
    body.includes('"widgetOrigin":"http://127.0.0.1:5001'),
    'se expone el origen del widget NoSQL desde el runtime',
  );
  assert.ok(
    body.includes('"apiOrigin":"http://127.0.0.1:6001'),
    'se respeta la API de NoSQL proporcionada',
  );
  assert.ok(
    body.includes('"widgetOrigin":"http://127.0.0.1:5002'),
    'se utiliza el widget del Event Bus del runtime',
  );
  assert.ok(
    body.includes('"apiOrigin":"http://127.0.0.1:6002'),
    'se combina el runtime con la API del Event Bus',
  );
  assert.ok(body.includes('"channel":"ventas"'), 'expone el canal configurado del Event Bus');
});

test('startDashboardServer utiliza el puerto 3000 por defecto', async (t) => {
  const { url, close } = await startDashboardServer();
  t.after(close);

  assert.match(url, /:3000\//);
});

test('startDashboardServer sirve los archivos JavaScript del dashboard', async (t) => {
  const { url, close } = await startDashboardServer({ port: 0 });
  t.after(close);

  const scriptResponse = await fetch(new URL('/dashboard/scripts/dashboard-layout.js', url));
  assert.equal(scriptResponse.status, 200);
  const scriptBody = await scriptResponse.text();
  assert.match(scriptBody, /loadDashboardLayout/);
});

test('startDashboardServer expone el widget de ecommerce del dominio de ventas digitales', async (t) => {
  const { url, close } = await startDashboardServer({ port: 0 });
  t.after(close);

  const widgetResponse = await fetch(new URL('/widgets/ventasdigitales/ecommerce/widget', url));
  assert.equal(widgetResponse.status, 200);
  const widgetBody = await widgetResponse.text();
  assert.match(widgetBody, /data-widget-id="ventasdigitales-ecommerce"/);
  assert.match(widgetBody, /widget-client\.jsx/);

  const clientResponse = await fetch(
    new URL('/widgets/ventasdigitales/ecommerce/widget-client.jsx', url),
  );
  assert.equal(clientResponse.status, 200);
  const clientBody = await clientResponse.text();
  assert.match(clientBody, /SKU-ACOUSTIC-01/);
  assert.match(clientBody, /OrderConfirmed/);
});

test('GET /api/logs responde sin emitir nuevos logs', async (t) => {
  const originalConsole = {
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };

  const counters = { info: 0, debug: 0, warn: 0, error: 0 };

  console.info = (...args) => {
    counters.info += 1;
    return originalConsole.info.call(console, ...args);
  };
  console.debug = (...args) => {
    counters.debug += 1;
    return originalConsole.debug.call(console, ...args);
  };
  console.warn = (...args) => {
    counters.warn += 1;
    return originalConsole.warn.call(console, ...args);
  };
  console.error = (...args) => {
    counters.error += 1;
    return originalConsole.error.call(console, ...args);
  };

  t.after(() => {
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  const fakeLogs = [{ message: 'hola', level: 'info', service: 'launcher', sequence: 1 }];
  const logCollector = {
    getLevels: () => ['info', 'error'],
    getLogs: ({ service, level }) => {
      assert.equal(service, 'launcher');
      assert.equal(level, 'info');
      return fakeLogs;
    },
    getServiceNames: () => ['launcher'],
  };

  const { url, close } = await startDashboardServer({ port: 0, logCollector });

  t.after(close);

  const before = { ...counters };
  const response = await fetch(new URL('/api/logs?service=launcher&level=info', url));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    items: fakeLogs,
    totalItems: fakeLogs.length,
    services: ['launcher'],
    levels: ['info', 'error'],
  });

  const after = { ...counters };
  assert.deepEqual(after, before, 'la petición no debe generar nuevos logs');
});
