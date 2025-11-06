'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('dominios-page monta el widget de ecommerce con el origen por defecto', async (t) => {
  const recorded = [];

  global.window = {
    location: { origin: 'http://localhost:3050/' },
    __LAUNCHER_CONFIG__: undefined,
  };
  global.document = {
    readyState: 'complete',
  };

  t.after(() => {
    delete global.window;
    delete global.document;
  });

  const loaderUrl = pathToFileURL(path.join(__dirname, '..', 'widget-loader.js'));
  const loaderModule = await import(loaderUrl);

  const stub = (options) => {
    recorded.push(options);
  };

  loaderModule.default.mountWidget = stub;
  global.window.dashboardWidgets = loaderModule.default;

  const scriptUrl = pathToFileURL(path.join(__dirname, '..', 'dominios-page.js'));
  await import(`${scriptUrl.href}?test=${Date.now()}`);

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].slotId, 'ventasdigitales-ecommerce-widget-slot');
  assert.equal(
    recorded[0].defaultWidgetOrigin,
    'http://localhost:3050/widgets/ventasdigitales/ecommerce/',
  );
  assert.equal(recorded[0].defaultApiOrigin, 'http://127.0.0.1:4300');
});

test('dominios-page utiliza la configuración del launcher cuando está disponible', async (t) => {
  const recorded = [];

  global.window = {
    location: { origin: 'http://localhost:4000' },
    __LAUNCHER_CONFIG__: {
      domains: {
        ventasDigitales: {
          ecommerceApi: { apiOrigin: 'http://127.0.0.1:5555' },
        },
      },
    },
  };
  global.document = {
    readyState: 'complete',
  };

  t.after(() => {
    delete global.window;
    delete global.document;
  });

  const loaderUrl = pathToFileURL(path.join(__dirname, '..', 'widget-loader.js'));
  const loaderModule = await import(loaderUrl);

  const stub = (options) => {
    recorded.push(options);
  };

  loaderModule.default.mountWidget = stub;
  global.window.dashboardWidgets = loaderModule.default;

  const scriptUrl = pathToFileURL(path.join(__dirname, '..', 'dominios-page.js'));
  await import(`${scriptUrl.href}?test=${Date.now()}`);

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].defaultApiOrigin, 'http://127.0.0.1:5555');
});
