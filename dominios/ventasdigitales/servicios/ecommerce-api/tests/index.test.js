'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const api = require('../src');

test('el índice reexporta los artefactos principales del servicio de checkout', () => {
  assert.equal(typeof api.startCheckoutService, 'function');
  assert.equal(typeof api.CheckoutProcessor, 'function');
  assert.equal(typeof api.CheckoutError, 'function');
  assert.ok(api.DEFAULT_COLLECTIONS.orders);
  assert.equal(typeof api.DEFAULT_EVENT_CHANNEL, 'string');
});
