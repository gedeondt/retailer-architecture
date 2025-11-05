'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  renderWidgetShell,
  WIDGET_CLIENT_PATH,
  WIDGET_ID,
  WIDGET_SIZE,
  ROOT_ID,
  escapeAttribute,
} = require('../src/widget-shell');

test('renderWidgetShell expone el widget con la configuración esperada', () => {
  const html = renderWidgetShell();

  assert.match(html, new RegExp(`data-widget-id="${WIDGET_ID}"`));
  assert.match(html, new RegExp(`data-widget-size="${WIDGET_SIZE}"`));
  assert.match(html, new RegExp(`<script type="text/babel"[^>]+src="${WIDGET_CLIENT_PATH}"`));
  assert.match(html, new RegExp(`<div[^>]+id="${ROOT_ID}"`));
});

test('renderWidgetShell permite configurar el origen de API del widget', () => {
  const html = renderWidgetShell({ apiOrigin: 'http://example.com/api' });
  assert.match(html, /data-api-origin="http:\/\/example.com\/api"/);
});

test('escapeAttribute reemplaza comillas dobles por entidades HTML', () => {
  assert.equal(escapeAttribute('http://a.com?q="x"'), 'http://a.com?q=&quot;x&quot;');
});

test('renderWidgetShell escapa atributos personalizados', () => {
  const html = renderWidgetShell({ apiOrigin: 'http://a.com?q="x"' });
  assert.match(html, /data-api-origin="http:\/\/a.com\?q=&quot;x&quot;"/);
});
