'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startLauncher, createDashboardHTML } = require('./launcher');

test('createDashboardHTML incluye las secciones principales y atributos de widgets', () => {
  const html = createDashboardHTML();
  assert.ok(html.includes('Panel maestro de microfrontends'), 'la cabecera del dashboard está presente');
  assert.ok(html.includes('data-widget-id="ventas-pedidos"'), 'incluye widget de pedidos');
  assert.ok(html.includes('data-widget-size="4"'), 'muestra widgets panorámicos de 4 columnas');
  assert.ok(html.includes('href="#dominios"'), 'el menú permite navegar a dominios');
});

test('startLauncher expone una URL que sirve el dashboard', async (t) => {
  const { url, close } = await startLauncher({ port: 0 });
  t.after(close);

  const response = await fetch(url);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Launcher Retailer/);
  assert.match(body, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);
});
