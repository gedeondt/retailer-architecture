'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('el cliente del widget CRM consume el backend y renderiza el menú de entidades', () => {
  const clientPath = path.join(__dirname, '..', 'src', 'widget-client.jsx');
  const source = fs.readFileSync(clientPath, 'utf8');

  assert.match(source, /DEFAULT_API_ORIGIN/);
  assert.match(source, /new URL\('\/entities'/);
  assert.match(source, /encodeURIComponent\(entityId\)/);
  assert.match(source, /Cargando entidades…/);
  assert.match(source, /No se pudieron cargar las entidades/);
  assert.match(source, /flex flex-wrap gap-2 mt-4/);
  assert.match(source, /table className/);
  assert.match(source, /Anterior/);
  assert.match(source, /Siguiente/);
  assert.match(source, /Consulta entidades sincronizadas/);
});
