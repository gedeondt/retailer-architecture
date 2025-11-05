'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ecommerce = require('../src');

test('el índice reexporta el shell del widget de ecommerce', () => {
  assert.equal(typeof ecommerce.renderWidgetShell, 'function');
  assert.equal(ecommerce.WIDGET_ID, 'ventasdigitales-ecommerce');
  assert.equal(ecommerce.WIDGET_SIZE, '2');
  assert.equal(ecommerce.WIDGET_CLIENT_PATH, '/widgets/ventasdigitales/ecommerce/widget-client.jsx');
  assert.equal(ecommerce.ROOT_ID, 'ventasdigitales-ecommerce-root');
});
