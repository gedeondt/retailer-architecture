'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_BODY_SIZE_BYTES = 1024 * 1024;
const THROUGHPUT_WINDOW_MS = 10_000;

class CollectionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function ensureObject(value, message) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CollectionError(message);
  }
}

function normalizeIndexKey(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).toLowerCase();
}

function validateCollectionName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new CollectionError('El nombre de la colección es obligatorio');
  }
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new CollectionError('El nombre de la colección solo puede contener letras, números, guiones y guiones bajos');
  }
  return name;
}

function validateIndexField(field) {
  if (typeof field !== 'string' || field.trim() === '') {
    throw new CollectionError('El campo de índice es obligatorio');
  }
  return field;
}

function parsePagination(page, pageSize) {
  const parsedPage = Number.parseInt(page ?? '1', 10);
  const parsedSize = Number.parseInt(pageSize ?? '10', 10);

  if (Number.isNaN(parsedPage) || parsedPage < 1) {
    throw new CollectionError('La página solicitada no es válida');
  }

  if (Number.isNaN(parsedSize) || parsedSize < 1 || parsedSize > MAX_BODY_SIZE_BYTES) {
    throw new CollectionError('El tamaño de página solicitado no es válido');
  }

  return { page: parsedPage, pageSize: parsedSize };
}

class CollectionStore {
  constructor({ baseDir, now = () => Date.now() }) {
    if (!baseDir) {
      throw new Error('baseDir es obligatorio');
    }
    this.baseDir = baseDir;
    this.collections = new Map();
    this.now = now;
  }

  async initialize() {
    await fs.mkdir(this.baseDir, { recursive: true });
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.name !== '.gitkeep')
        .map((entry) => fs.rm(path.join(this.baseDir, entry.name), { recursive: true, force: true })),
    );
    this.collections.clear();
  }

  async createCollection({ name, indexField }) {
    const normalizedName = validateCollectionName(name);
    const normalizedIndex = validateIndexField(indexField);

    if (this.collections.has(normalizedName)) {
      throw new CollectionError('La colección ya existe', 409);
    }

    const collectionDir = path.join(this.baseDir, normalizedName);
    await fs.mkdir(collectionDir, { recursive: true });

    const collection = {
      name: normalizedName,
      indexField: normalizedIndex,
      dir: collectionDir,
      index: new Map(),
      keyById: new Map(),
      itemCount: 0,
      throughput: [],
    };

    this.collections.set(normalizedName, collection);
    return { name: collection.name, indexField: collection.indexField };
  }

  getCollection(name) {
    const collection = this.collections.get(name);
    if (!collection) {
      throw new CollectionError('La colección no existe', 404);
    }
    return collection;
  }

  recordOperation(collection) {
    const now = this.now();
    collection.throughput.push(now);
    this.cleanupThroughput(collection, now);
  }

  cleanupThroughput(collection, now = this.now()) {
    const windowStart = now - THROUGHPUT_WINDOW_MS;
    while (collection.throughput.length && collection.throughput[0] < windowStart) {
      collection.throughput.shift();
    }
  }

  async addItem(collectionName, payload) {
    const collection = this.getCollection(collectionName);
    ensureObject(payload, 'Solo se aceptan objetos JSON para almacenar');

    if (!(collection.indexField in payload)) {
      throw new CollectionError(`El documento debe incluir el campo de índice "${collection.indexField}"`);
    }

    const id = randomUUID();
    const itemPath = path.join(collection.dir, `${id}.json`);
    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(itemPath, serialized, 'utf8');

    this.updateIndexForInsert(collection, id, payload);
    collection.itemCount += 1;
    this.recordOperation(collection);

    return { id, value: payload };
  }

  updateIndexForInsert(collection, id, payload) {
    const indexKey = normalizeIndexKey(payload[collection.indexField]);
    if (!collection.index.has(indexKey)) {
      collection.index.set(indexKey, new Set());
    }
    collection.index.get(indexKey).add(id);
    collection.keyById.set(id, indexKey);
  }

  updateIndexForUpdate(collection, id, payload) {
    const previousKey = collection.keyById.get(id);
    const nextKey = normalizeIndexKey(payload[collection.indexField]);

    if (previousKey && previousKey !== nextKey) {
      const bucket = collection.index.get(previousKey);
      if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) {
          collection.index.delete(previousKey);
        }
      }
    }

    if (!collection.index.has(nextKey)) {
      collection.index.set(nextKey, new Set());
    }

    collection.index.get(nextKey).add(id);
    collection.keyById.set(id, nextKey);
  }

  async getItem(collectionName, id) {
    const collection = this.getCollection(collectionName);
    const itemPath = path.join(collection.dir, `${id}.json`);

    try {
      const content = await fs.readFile(itemPath, 'utf8');
      const value = JSON.parse(content);
      this.recordOperation(collection);
      return { id, value };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new CollectionError('El elemento solicitado no existe', 404);
      }
      throw error;
    }
  }

  async updateItem(collectionName, id, payload) {
    const collection = this.getCollection(collectionName);
    ensureObject(payload, 'Solo se aceptan objetos JSON para almacenar');

    if (!(collection.indexField in payload)) {
      throw new CollectionError(`El documento debe incluir el campo de índice "${collection.indexField}"`);
    }

    const itemPath = path.join(collection.dir, `${id}.json`);
    const serialized = JSON.stringify(payload, null, 2);

    try {
      await fs.access(itemPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new CollectionError('El elemento solicitado no existe', 404);
      }
      throw error;
    }

    await fs.writeFile(itemPath, serialized, 'utf8');
    this.updateIndexForUpdate(collection, id, payload);
    this.recordOperation(collection);

    return { id, value: payload };
  }

  async deleteItem(collectionName, id) {
    const collection = this.getCollection(collectionName);
    const itemPath = path.join(collection.dir, `${id}.json`);

    try {
      await fs.rm(itemPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new CollectionError('El elemento solicitado no existe', 404);
      }
      throw error;
    }

    const key = collection.keyById.get(id);
    if (key) {
      const bucket = collection.index.get(key);
      if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) {
          collection.index.delete(key);
        }
      }
      collection.keyById.delete(id);
    }

    collection.itemCount = Math.max(0, collection.itemCount - 1);
    this.recordOperation(collection);
    return { id };
  }

  async listItems(collectionName, options = {}) {
    const collection = this.getCollection(collectionName);
    const { page, pageSize } = parsePagination(options.page, options.pageSize);

    const fileNames = await fs.readdir(collection.dir);
    const ids = fileNames
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();

    const totalItems = ids.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const start = (page - 1) * pageSize;
    const slice = ids.slice(start, start + pageSize);

    collection.itemCount = totalItems;

    const items = [];
    for (const id of slice) {
      const itemPath = path.join(collection.dir, `${id}.json`);
      const content = await fs.readFile(itemPath, 'utf8');
      items.push({ id, value: JSON.parse(content) });
    }

    this.recordOperation(collection);

    return { items, totalItems, totalPages, page, pageSize };
  }

  async searchItems(collectionName, query, options = {}) {
    if (typeof query !== 'string' || query.trim() === '') {
      throw new CollectionError('El parámetro de búsqueda es obligatorio');
    }

    const collection = this.getCollection(collectionName);
    const { page, pageSize } = parsePagination(options.page, options.pageSize);
    const normalizedQuery = query.toLowerCase();

    const matchingIds = [];
    for (const [key, ids] of collection.index.entries()) {
      if (key.includes(normalizedQuery)) {
        for (const id of ids) {
          matchingIds.push(id);
        }
      }
    }

    matchingIds.sort();
    const totalItems = matchingIds.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const start = (page - 1) * pageSize;
    const slice = matchingIds.slice(start, start + pageSize);

    const items = [];
    for (const id of slice) {
      const itemPath = path.join(collection.dir, `${id}.json`);
      const content = await fs.readFile(itemPath, 'utf8');
      items.push({ id, value: JSON.parse(content) });
    }

    this.recordOperation(collection);

    return { items, totalItems, totalPages, page, pageSize };
  }

  getCollectionSummaries() {
    const now = this.now();
    return Array.from(this.collections.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((collection) => {
        this.cleanupThroughput(collection, now);
        return {
          name: collection.name,
          indexField: collection.indexField,
          itemCount: collection.itemCount,
          throughput: collection.throughput.length,
        };
      });
  }
}

module.exports = {
  CollectionStore,
  CollectionError,
  parsePagination,
  normalizeIndexKey,
};
