'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const crmFrontend = require('../src');

test('el índice reexporta el shell del widget CRM', () => {
  assert.equal(typeof crmFrontend.renderWidgetShell, 'function');
  assert.equal(crmFrontend.WIDGET_ID, 'atencionalcliente-crm');
  assert.equal(crmFrontend.WIDGET_SIZE, '2');
  assert.equal(
    crmFrontend.WIDGET_CLIENT_PATH,
    '/widgets/atencionalcliente/crm/widget-client.jsx',
  );
  assert.equal(crmFrontend.ROOT_ID, 'atencionalcliente-crm-root');
});
