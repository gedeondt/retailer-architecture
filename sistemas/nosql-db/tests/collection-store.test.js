'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { CollectionStore, CollectionError } = require('../src/collection-store');

async function createTempDir(prefix) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return base;
}

test('CollectionStore gestiona el ciclo de vida completo de los documentos', async (t) => {
  const tempDir = await createTempDir('nosql-store-');
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const store = new CollectionStore({ baseDir: tempDir });
  await store.initialize();
  await store.createCollection({ name: 'clientes', indexField: 'email' });

  const created = await store.addItem('clientes', {
    email: 'ana@example.com',
    nombre: 'Ana',
  });
  assert.match(created.id, /^[0-9a-f-]{36}$/i);

  const fetched = await store.getItem('clientes', created.id);
  assert.equal(fetched.value.nombre, 'Ana');

  await store.updateItem('clientes', created.id, {
    email: 'ana@example.com',
    nombre: 'Ana Gómez',
  });

  const list = await store.listItems('clientes', { page: 1, pageSize: 10 });
  assert.equal(list.totalItems, 1);
  assert.equal(list.items[0].value.nombre, 'Ana Gómez');

  const search = await store.searchItems('clientes', 'ana@', { page: 1, pageSize: 10 });
  assert.equal(search.totalItems, 1);

  await store.deleteItem('clientes', created.id);
  const afterDelete = await store.listItems('clientes', { page: 1, pageSize: 10 });
  assert.equal(afterDelete.totalItems, 0);
});

test('CollectionStore mantiene el throughput acotado a los últimos 10 segundos', async (t) => {
  const tempDir = await createTempDir('nosql-store-throughput-');
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  let now = 1_000;
  const store = new CollectionStore({
    baseDir: tempDir,
    now: () => now,
  });

  await store.initialize();
  await store.createCollection({ name: 'pedidos', indexField: 'codigo' });

  await store.addItem('pedidos', { codigo: 'A-1' });
  await store.addItem('pedidos', { codigo: 'A-2' });

  let summaries = store.getCollectionSummaries();
  assert.equal(summaries[0].throughput, 2);

  now += 11_000;
  summaries = store.getCollectionSummaries();
  assert.equal(summaries[0].throughput, 0);
});

test('CollectionStore valida el campo de índice requerido', async (t) => {
  const tempDir = await createTempDir('nosql-store-validation-');
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const store = new CollectionStore({ baseDir: tempDir });
  await store.initialize();
  await store.createCollection({ name: 'tickets', indexField: 'codigo' });

  await assert.rejects(
    () => store.addItem('tickets', { descripcion: 'Sin código' }),
    (error) => {
      assert(error instanceof CollectionError);
      assert.match(error.message, /campo de índice/i);
      return true;
    },
  );
});

test('CollectionStore impide inserciones cuando se supera el límite de almacenamiento', async (t) => {
  const tempDir = await createTempDir('nosql-store-capacity-');
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const store = new CollectionStore({ baseDir: tempDir, maxStorageBytes: 1_024 });
  await store.initialize();
  await store.createCollection({ name: 'archivos', indexField: 'clave' });

  await store.addItem('archivos', { clave: 'a', contenido: 'x'.repeat(400) });

  await assert.rejects(
    () => store.addItem('archivos', { clave: 'b', contenido: 'y'.repeat(600) }),
    (error) => {
      assert(error instanceof CollectionError);
      assert.equal(error.status, 507);
      assert.match(error.message, /límite de almacenamiento/i);
      return true;
    },
  );

  const stats = store.getStorageStats();
  assert(stats.usedBytes <= stats.limitBytes);
  assert(stats.freeBytes >= 0);
});

test('CollectionStore también restringe actualizaciones que exceden el espacio disponible', async (t) => {
  const tempDir = await createTempDir('nosql-store-update-capacity-');
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const store = new CollectionStore({ baseDir: tempDir, maxStorageBytes: 500 });
  await store.initialize();
  await store.createCollection({ name: 'documentos', indexField: 'clave' });

  const created = await store.addItem('documentos', { clave: 'doc-1', contenido: 'z'.repeat(300) });

  await assert.rejects(
    () => store.updateItem('documentos', created.id, { clave: 'doc-1', contenido: 'w'.repeat(700) }),
    (error) => {
      assert(error instanceof CollectionError);
      assert.equal(error.status, 507);
      return true;
    },
  );

  const afterStats = store.getStorageStats();
  assert(afterStats.usedBytes <= afterStats.limitBytes);
});
