'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function defaultClock() {
  return new Date();
}

function sanitizeConsumerName(name) {
  return encodeURIComponent(name).replace(/%/g, '_');
}

function sanitizeChannelName(name) {
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
    const { dataDir, clock = defaultClock, channels = [] } = options;

    this.dataDir = dataDir ?? path.join(__dirname, '..', 'data');
    this.clock = clock;
    this.metaFile = path.join(this.dataDir, 'meta.json');
    this.channelsDir = path.join(this.dataDir, 'channels');
    this.consumersDir = path.join(this.dataDir, 'consumers');
    this.initialChannels = Array.isArray(channels) ? channels : [channels];

    this._initPromise = this._initialize();
  }

  async _initialize() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.channelsDir, { recursive: true });
    await fs.mkdir(this.consumersDir, { recursive: true });

    if (!(await fileExists(this.metaFile))) {
      await this._writeMeta({ channels: {} });
    }

    const meta = await this._readMeta({ skipInitWait: true });
    const uniqueChannels = new Set([
      ...this.initialChannels
        .filter((name) => typeof name === 'string')
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
      ...Object.values(meta.channels ?? {})
        .map((channel) => channel.name)
        .filter((name) => typeof name === 'string' && name.trim().length > 0)
        .map((name) => name.trim()),
    ]);

    for (const channelName of uniqueChannels) {
      if (typeof channelName === 'string' && channelName.trim().length > 0) {
        await this._ensureChannel(channelName.trim(), { meta, skipInitWait: true });
      }
    }
  }

  async _readMeta(options = {}) {
    if (options.skipInitWait !== true) {
      await this._initPromise;
    }
    const raw = await fs.readFile(this.metaFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.channels || typeof parsed.channels !== 'object') {
      parsed.channels = {};
    }
    return parsed;
  }

  async _writeMeta(meta) {
    await fs.writeFile(this.metaFile, JSON.stringify(meta, null, 2), 'utf8');
  }

  _getChannelEventsFile(sanitizedChannel) {
    return path.join(this.channelsDir, `${sanitizedChannel}.log`);
  }

  _getChannelConsumersDir(sanitizedChannel) {
    return path.join(this.consumersDir, sanitizedChannel);
  }

  async _ensureChannel(channelName, options = {}) {
    if (options.skipInitWait !== true) {
      await this._initPromise;
    }

    if (!channelName || typeof channelName !== 'string') {
      throw new TypeError('El nombre del canal debe ser un string no vacío');
    }

    const trimmed = channelName.trim();
    if (!trimmed) {
      throw new TypeError('El nombre del canal debe ser un string no vacío');
    }

    const sanitized = sanitizeChannelName(trimmed);
    const meta =
      options.meta ??
      (await this._readMeta({ skipInitWait: options.skipInitWait === true }));
    if (!meta.channels || typeof meta.channels !== 'object') {
      meta.channels = {};
    }

    let channelMeta = meta.channels[sanitized];
    let metaChanged = false;
    if (!channelMeta) {
      channelMeta = { name: trimmed, lastId: 0 };
      meta.channels[sanitized] = channelMeta;
      metaChanged = true;
    }

    const eventsFile = this._getChannelEventsFile(sanitized);
    if (!(await fileExists(eventsFile))) {
      await fs.writeFile(eventsFile, '', 'utf8');
    }

    const consumersDir = this._getChannelConsumersDir(sanitized);
    await fs.mkdir(consumersDir, { recursive: true });

    if (metaChanged && options.deferMetaWrite !== true) {
      await this._writeMeta(meta);
    }

    return { meta, sanitized, channelMeta, metaChanged };
  }

  async append(event) {
    if (!event || typeof event !== 'object') {
      throw new TypeError('append() requiere un objeto de evento');
    }

    await this._initPromise;

    if (typeof event.channel !== 'string' || event.channel.trim().length === 0) {
      throw new TypeError('append() requiere un canal de tipo string no vacío');
    }

    const channelName = event.channel.trim();
    const { meta, sanitized, channelMeta } = await this._ensureChannel(channelName, {
      deferMetaWrite: true,
    });
    const timestamp = this.clock();

    if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
      throw new TypeError('El reloj del EventLog debe devolver instancias de Date válidas');
    }

    const id = channelMeta.lastId + 1;
    const record = {
      id,
      channel: channelMeta.name,
      type: event.type ?? null,
      payload: event.payload ?? null,
      timestamp: timestamp.toISOString(),
    };

    const eventsFile = this._getChannelEventsFile(sanitized);
    await fs.appendFile(eventsFile, `${JSON.stringify(record)}\n`, 'utf8');

    meta.channels[sanitized] = { ...channelMeta, lastId: id };
    await this._writeMeta(meta);

    return record;
  }

  async _readAllEvents(sanitizedChannel) {
    await this._initPromise;

    const eventsFile = this._getChannelEventsFile(sanitizedChannel);
    const content = await fs.readFile(eventsFile, 'utf8');
    if (!content) {
      return [];
    }

    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  }

  async getEventsSince(offset = 0, options = {}) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new TypeError('offset debe ser un entero mayor o igual a cero');
    }

    if (typeof options.channel !== 'string' || options.channel.trim().length === 0) {
      throw new TypeError('getEventsSince requiere un canal de tipo string no vacío');
    }

    const channelName = options.channel.trim();
    const { sanitized } = await this._ensureChannel(channelName);
    const events = await this._readAllEvents(sanitized);
    return events.filter((event) => event.id > offset);
  }

  async listEvents(options = {}) {
    if (typeof options.channel !== 'string' || options.channel.trim().length === 0) {
      throw new TypeError('listEvents requiere un canal de tipo string no vacío');
    }

    const channelName = options.channel.trim();
    const { sanitized } = await this._ensureChannel(channelName);
    return this._readAllEvents(sanitized);
  }

  async createConsumer(name, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('createConsumer() requiere un nombre de consumidor de tipo string');
    }

    await this._initPromise;

    if (typeof options.channel !== 'string' || options.channel.trim().length === 0) {
      throw new TypeError('createConsumer() requiere un canal de tipo string no vacío');
    }

    const channelName = options.channel.trim();
    const { sanitized: channelSanitized, channelMeta } = await this._ensureChannel(channelName);
    const sanitizedName = sanitizeConsumerName(name);
    const consumersDir = this._getChannelConsumersDir(channelSanitized);
    await fs.mkdir(consumersDir, { recursive: true });

    const consumer = new EventConsumer({
      name,
      sanitizedName,
      channel: channelMeta.name,
      channelSanitizedName: channelSanitized,
      log: this,
    });
    await consumer._initialize();
    return consumer;
  }

  async listConsumers(options = {}) {
    await this._initPromise;

    const channelFilter = options.channel ?? null;
    const meta = await this._readMeta();
    const consumerDirs = await fs.readdir(this.consumersDir, { withFileTypes: true });

    const consumers = [];
    for (const entry of consumerDirs) {
      if (!entry.isDirectory()) {
        continue;
      }

      const channelSanitized = entry.name;
      const channelInfo = meta.channels[channelSanitized];
      const channelName = channelInfo ? channelInfo.name : channelSanitized;

      const files = await fs.readdir(path.join(this.consumersDir, channelSanitized), {
        withFileTypes: true,
      });

      for (const fileEntry of files) {
        if (!fileEntry.isFile() || !isConsumerFile(fileEntry.name)) {
          continue;
        }

        const filePath = path.join(this.consumersDir, channelSanitized, fileEntry.name);
        const data = await readConsumerFile(filePath);
        const inferredName = data.name ?? fileEntry.name.replace(/\.json$/u, '');
        const resolvedChannel = data.channel ?? channelName;

        if (channelFilter && resolvedChannel !== channelFilter) {
          continue;
        }

        consumers.push({
          name: inferredName,
          channel: resolvedChannel,
          offset: data.offset,
          updatedAt: data.updatedAt,
        });
      }
    }

    consumers.sort((a, b) => {
      if (a.channel === b.channel) {
        return a.name.localeCompare(b.name);
      }
      return a.channel.localeCompare(b.channel);
    });

    return consumers;
  }

  async reset() {
    await this._initPromise;

    await fs.rm(this.channelsDir, { force: true, recursive: true });
    await fs.rm(this.consumersDir, { force: true, recursive: true });

    await fs.mkdir(this.channelsDir, { recursive: true });
    await fs.mkdir(this.consumersDir, { recursive: true });
    await this._writeMeta({ channels: {} });

    const meta = await this._readMeta();
    const uniqueChannels = new Set(
      this.initialChannels
        .filter((name) => typeof name === 'string')
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    );

    for (const channelName of uniqueChannels) {
      await this._ensureChannel(channelName, { meta });
    }
  }
}

class EventConsumer {
  constructor({ name, sanitizedName, channel, channelSanitizedName, log }) {
    this.name = name;
    this.channel = channel;
    this.log = log;
    this.offsetFile = path.join(
      log.consumersDir,
      channelSanitizedName,
      `${sanitizedName}.json`
    );
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
      channel: this.channel,
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
    const events = await this.log.getEventsSince(currentOffset, { channel: this.channel });

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
    channel: typeof data.channel === 'string' && data.channel.length > 0 ? data.channel : null,
    offset: Number.isInteger(data.offset) && data.offset >= 0 ? data.offset : 0,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
  };
}

module.exports = {
  SimpleEventLog,
  EventConsumer,
};
