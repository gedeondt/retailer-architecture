'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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
  const { url, close } = await startLauncher({ port: 0 });
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
  assert.match(sistemasBody, /Bus de eventos/);
});
