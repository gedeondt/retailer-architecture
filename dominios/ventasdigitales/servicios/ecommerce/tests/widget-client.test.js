'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('el cliente del widget define los productos base y la estructura del evento', () => {
  const clientPath = path.join(__dirname, '..', 'src', 'widget-client.jsx');
  const source = fs.readFileSync(clientPath, 'utf8');

  assert.match(source, /const PRODUCTS = \[/, 'declara la lista de productos iniciales');
  const productOccurrences = (source.match(/sku:\s*'SKU-/g) || []).length;
  assert.equal(productOccurrences, 4, 'contiene exactamente cuatro productos predeterminados');
  assert.match(source, /name:\s*'OrderConfirmed'/, 'prepara el evento OrderConfirmed');
  assert.match(source, /createRoot\(container\)/, 'monta el widget utilizando ReactDOM.createRoot');
  assert.match(source, /customerFirstName/, 'solicita el nombre del cliente');
  assert.match(source, /paymentCardNumber/, 'solicita los datos de tarjeta para el pago');
  assert.ok(
    !/onFieldChange\('orderId'/.test(source) && !/name="orderId"/.test(source),
    'no requiere ingresar manualmente el identificador del pedido',
  );
  assert.match(source, /DEFAULT_API_ORIGIN/, 'define un origen por defecto para el servicio de ecommerce');
  assert.match(source, /Enviar pedido/, 'incluye el botón para enviar el payload del checkout');
  assert.match(source, /fetch\(/, 'publica la orden en el servicio de ecommerce');
});
