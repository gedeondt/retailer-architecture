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
  const collectionNames = nosqlPayload.items.map((item) => item.name);
  assert.ok(
    collectionNames.includes('digital-orders'),
    'crea la colección de pedidos digitales al iniciar la API de ecommerce',
  );
  assert.ok(
    collectionNames.includes('digital-order-lines'),
    'crea la colección de líneas del pedido digital',
  );
  assert.ok(
    collectionNames.includes('digital-order-payments'),
    'crea la colección de pagos del pedido digital',
  );

  const eventBusResponse = await fetch(new URL('/overview?channel=general', systems.eventBus.url));
  assert.equal(eventBusResponse.status, 200);
  const eventBusPayload = await eventBusResponse.json();
  assert.equal(eventBusPayload.totalEvents, 0);
  assert.ok(Array.isArray(eventBusPayload.channels));

  const nosqlLogsResponse = await fetch(new URL('/api/logs?service=nosql-db', url));
  assert.equal(nosqlLogsResponse.status, 200);
  const nosqlLogs = await nosqlLogsResponse.json();
  assert.ok(nosqlLogs.totalItems > 0, 'se registran logs para el servicio NoSQL');
  assert.ok(
    nosqlLogs.items.some((entry) => entry.message.includes('Listando colecciones')),
    'los logs del servicio NoSQL reflejan las lecturas de colecciones',
  );

  const eventBusLogsResponse = await fetch(new URL('/api/logs?service=event-bus', url));
  assert.equal(eventBusLogsResponse.status, 200);
  const eventBusLogs = await eventBusLogsResponse.json();
  assert.ok(eventBusLogs.totalItems > 0, 'se registran logs para el servicio Event Bus');
  assert.ok(
    eventBusLogs.items.some((entry) => entry.message.includes('Generando overview para el canal general')),
    'los logs del Event Bus reflejan las consultas de overview',
  );

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

test('startLauncher expone los logs capturados por servicio', async (t) => {
  const { url, close, logs } = await startLauncher({ port: 0, startSystems: false, logBufferLimit: 3 });
  t.after(close);

  await logs.withServiceContext('servicio-prueba', async () => {
    console.log('info 1');
    console.log('info 2');
    console.debug('debug intermedio');
    console.error('error critico');
    console.log('info 3');
    console.log('info 4');
  });

  const allLogsResponse = await fetch(new URL('/api/logs?service=servicio-prueba', url));
  assert.equal(allLogsResponse.status, 200);
  const allLogs = await allLogsResponse.json();
  assert.equal(allLogs.totalItems, 5);
  const infoLogs = allLogs.items.filter((entry) => entry.level === 'info');
  assert.equal(infoLogs.length, 3, 'respeta el límite del buffer para el nivel info');
  assert.ok(infoLogs.some((entry) => entry.message.includes('info 4')));
  assert.ok(allLogs.items.some((entry) => entry.level === 'error' && entry.message.includes('error critico')));
  assert.ok(allLogs.services.includes('servicio-prueba'));

  const errorLogsResponse = await fetch(new URL('/api/logs?service=servicio-prueba&level=error', url));
  assert.equal(errorLogsResponse.status, 200);
  const errorLogs = await errorLogsResponse.json();
  assert.equal(errorLogs.totalItems, 1);
  assert.equal(errorLogs.items[0].level, 'error');

  const invalidResponse = await fetch(new URL('/api/logs?level=verbose', url));
  assert.equal(invalidResponse.status, 400);
  const invalidBody = await invalidResponse.json();
  assert.match(invalidBody.message, /Nivel de log inválido/);
});

test('startLauncher inicia la API de ecommerce y la conecta a los sistemas compartidos', async (t) => {
  const nosqlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-nosql-ecommerce-'));
  const eventBusDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-eventbus-ecommerce-'));

  const { close, systems, domains } = await startLauncher({
    port: 0,
    systemsConfig: {
      nosqlDb: { port: 0, host: '127.0.0.1', dataDir: nosqlDir },
      eventBus: { port: 0, host: '127.0.0.1', dataDir: eventBusDir },
    },
    domainServicesConfig: {
      ventasDigitales: {
        ecommerceApi: { port: 0, host: '127.0.0.1' },
      },
    },
  });

  t.after(async () => {
    await close();
    await fs.rm(nosqlDir, { recursive: true, force: true });
    await fs.rm(eventBusDir, { recursive: true, force: true });
  });

  const ecommerceService = domains?.ventasDigitales?.ecommerceApi;
  assert.ok(ecommerceService, 'expone el servicio de ecommerce en el launcher');
  assert.ok(ecommerceService.url, 'incluye la URL del servicio de ecommerce');

  const healthResponse = await fetch(new URL('/health', ecommerceService.url));
  assert.equal(healthResponse.status, 200);

  const payload = {
    customer: {
      firstName: 'María',
      lastName: 'Fernández',
      email: 'maria@example.com',
    },
    payment: {
      method: 'credit_card',
      card: {
        holderName: 'María Fernández',
        last4: '4242',
        brand: 'visa',
        expiryMonth: '09',
        expiryYear: '2032',
      },
      securityCodeProvided: true,
    },
    items: [
      { sku: 'SKU-GUITAR-01', quantity: 1, price: 540.5 },
      { sku: 'SKU-GUITAR-CASE', quantity: 1, price: 89.99 },
    ],
    totalAmount: 630.49,
    currency: 'USD',
    channelOrigin: 'web',
  };

  const orderResponse = await fetch(new URL('/orders', ecommerceService.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(orderResponse.status, 201);
  const orderBody = await orderResponse.json();
  assert.ok(orderBody.orderId, 'devuelve el identificador del pedido');
  assert.equal(orderBody.event.type, 'OrderConfirmed');
  assert.equal(orderBody.event.payload.orderId, orderBody.orderId);

  const eventsResponse = await fetch(
    new URL('/events?channel=ventasdigitales.orders', systems.eventBus.url),
  );
  assert.equal(eventsResponse.status, 200);
  const eventsData = await eventsResponse.json();
  assert.ok(eventsData.items.length >= 1, 'registra eventos en el canal de ventas digitales');
  assert.ok(
    eventsData.items.some((event) => event.payload?.orderId === orderBody.orderId),
    'el evento publicado corresponde al pedido confirmado',
  );
});
