'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('dominios-page monta el widget de ecommerce con el origen por defecto', async (t) => {
  const recorded = [];

  global.window = {
    location: { origin: 'http://localhost:3050/' },
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
  await import(scriptUrl);

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].slotId, 'ventasdigitales-ecommerce-widget-slot');
  assert.equal(
    recorded[0].defaultWidgetOrigin,
    'http://localhost:3050/widgets/ventasdigitales/ecommerce/',
  );
});
