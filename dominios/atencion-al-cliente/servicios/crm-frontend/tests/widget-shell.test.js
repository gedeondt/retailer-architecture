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

test('renderWidgetShell genera la estructura del widget CRM', () => {
  const html = renderWidgetShell();

  assert.match(html, new RegExp(`data-widget-id="${WIDGET_ID}"`));
  assert.match(html, new RegExp(`data-widget-size="${WIDGET_SIZE}"`));
  assert.match(html, new RegExp(`<div[^>]+id="${ROOT_ID}"`));
  assert.match(html, new RegExp(`<script type="text/babel"[^>]+src="${WIDGET_CLIENT_PATH}"`));
});

test('renderWidgetShell permite inyectar el origen del backend', () => {
  const html = renderWidgetShell({ apiOrigin: 'http://crm.example.com' });
  assert.match(html, /data-api-origin="http:\/\/crm.example.com"/);
});

test('escapeAttribute reemplaza caracteres especiales', () => {
  assert.equal(escapeAttribute('http://a.com?q="b"'), 'http://a.com?q=&quot;b&quot;');
});
