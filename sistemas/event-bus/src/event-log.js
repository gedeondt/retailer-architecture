'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function defaultClock() {
  return new Date();
}

function sanitizeConsumerName(name) {
  return encodeURIComponent(name).replace(/%/g, '_');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false;
    }
    throw error;
  }
}

class SimpleEventLog {
  constructor(options = {}) {
    const { dataDir, clock = defaultClock } = options;

    this.dataDir = dataDir ?? path.join(__dirname, '..', 'data');
    this.clock = clock;
    this.eventsFile = path.join(this.dataDir, 'events.log');
    this.metaFile = path.join(this.dataDir, 'meta.json');
    this.consumersDir = path.join(this.dataDir, 'consumers');

    this._initPromise = this._initialize();
  }

  async _initialize() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.consumersDir, { recursive: true });

    if (!(await fileExists(this.eventsFile))) {
      await fs.writeFile(this.eventsFile, '', 'utf8');
    }

    if (!(await fileExists(this.metaFile))) {
      await this._writeMeta({ lastId: 0 });
    }
  }

  async _readMeta() {
    await this._initPromise;
    const raw = await fs.readFile(this.metaFile, 'utf8');
    return JSON.parse(raw);
  }

  async _writeMeta(meta) {
    await fs.writeFile(this.metaFile, JSON.stringify(meta, null, 2), 'utf8');
  }

  async append(event) {
    if (!event || typeof event !== 'object') {
      throw new TypeError('append() requiere un objeto de evento');
    }

    await this._initPromise;

    const meta = await this._readMeta();
    const id = meta.lastId + 1;
    const timestamp = this.clock();

    if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
      throw new TypeError('El reloj del EventLog debe devolver instancias de Date válidas');
    }

    const record = {
      id,
      type: event.type ?? null,
      payload: event.payload ?? null,
      timestamp: timestamp.toISOString(),
    };

    await fs.appendFile(this.eventsFile, `${JSON.stringify(record)}\n`, 'utf8');
    await this._writeMeta({ lastId: id });

    return record;
  }

  async _readAllEvents() {
    await this._initPromise;

    const content = await fs.readFile(this.eventsFile, 'utf8');
    if (!content) {
      return [];
    }

    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  }

  async getEventsSince(offset = 0) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new TypeError('offset debe ser un entero mayor o igual a cero');
    }

    const events = await this._readAllEvents();
    return events.filter((event) => event.id > offset);
  }

  async listEvents() {
    return this._readAllEvents();
  }

  async createConsumer(name) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('createConsumer() requiere un nombre de consumidor de tipo string');
    }

    await this._initPromise;

    const consumer = new EventConsumer({
      name,
      sanitizedName: sanitizeConsumerName(name),
      log: this,
    });
    await consumer._initialize();
    return consumer;
  }

  async listConsumers() {
    await this._initPromise;

    const files = await fs.readdir(this.consumersDir, { withFileTypes: true });
    const consumerFiles = files.filter((entry) => entry.isFile() && isConsumerFile(entry.name));

    const consumers = await Promise.all(
      consumerFiles.map((entry) =>
        readConsumerFile(path.join(this.consumersDir, entry.name)).then((data) => ({
          name: data.name ?? entry.name.replace(/\.json$/u, ''),
          offset: data.offset,
          updatedAt: data.updatedAt,
        }))
      )
    );

    consumers.sort((a, b) => a.name.localeCompare(b.name));

    return consumers;
  }

  async reset() {
    await this._initPromise;

    await fs.writeFile(this.eventsFile, '', 'utf8');
    await this._writeMeta({ lastId: 0 });

    const consumerFiles = await fs.readdir(this.consumersDir);
    await Promise.all(
      consumerFiles.map((file) =>
        fs.rm(path.join(this.consumersDir, file), { force: true })
      )
    );
  }
}

class EventConsumer {
  constructor({ name, sanitizedName, log }) {
    this.name = name;
    this.log = log;
    this.offsetFile = path.join(log.consumersDir, `${sanitizedName}.json`);
  }

  async _readOffset() {
    await this._initialize();
    const raw = await fs.readFile(this.offsetFile, 'utf8');
    const data = JSON.parse(raw);
    return data.offset ?? 0;
  }

  async _writeOffset(offset) {
    const payload = {
      name: this.name,
      offset,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(this.offsetFile, JSON.stringify(payload, null, 2), 'utf8');
  }

  async poll(options = {}) {
    const { limit = Infinity, autoCommit = true } = options;

    if (limit !== Infinity && (!Number.isInteger(limit) || limit <= 0)) {
      throw new TypeError('limit debe ser un entero positivo o Infinity');
    }

    const currentOffset = await this._readOffset();
    const events = await this.log.getEventsSince(currentOffset);

    const batch = Number.isFinite(limit) ? events.slice(0, limit) : events;

    if (batch.length > 0 && autoCommit) {
      const newOffset = batch[batch.length - 1].id;
      await this._writeOffset(newOffset);
    }

    return batch;
  }

  async commit(lastEventId) {
    if (!Number.isInteger(lastEventId) || lastEventId < 0) {
      throw new TypeError('commit requiere un identificador de evento entero mayor o igual a cero');
    }

    await this._writeOffset(lastEventId);
  }

  async reset() {
    await this._writeOffset(0);
  }

  async getOffset() {
    return this._readOffset();
  }

  async _initialize() {
    await this.log._initPromise;
    if (!(await fileExists(this.offsetFile))) {
      await this._writeOffset(0);
    }
  }
}

function isConsumerFile(fileName) {
  return fileName.endsWith('.json');
}

async function readConsumerFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  return {
    name: typeof data.name === 'string' && data.name.length > 0 ? data.name : null,
    offset: Number.isInteger(data.offset) && data.offset >= 0 ? data.offset : 0,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
  };
}

module.exports = {
  SimpleEventLog,
  EventConsumer,
};
