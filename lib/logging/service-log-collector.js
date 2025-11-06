'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { format } = require('node:util');
const { BoundedBuffer } = require('./bounded-buffer');

const DEFAULT_LEVELS = ['info', 'debug', 'error'];

function normalizeServiceName(rawName) {
  if (typeof rawName !== 'string') {
    return 'launcher';
  }
  const trimmed = rawName.trim();
  return trimmed === '' ? 'launcher' : trimmed;
}

function createServiceLogCollector(options = {}) {
  const { limitPerLevel = 100, levels = DEFAULT_LEVELS } = options;

  if (!Array.isArray(levels) || levels.length === 0) {
    throw new TypeError('Debe proporcionarse al menos un nivel de log');
  }

  if (!Number.isInteger(limitPerLevel) || limitPerLevel <= 0) {
    throw new RangeError('El límite de elementos por nivel debe ser un entero positivo');
  }

  const levelSet = new Set(levels);
  const storage = new AsyncLocalStorage();
  const buffersByService = new Map();
  const services = new Set();
  let sequence = 0;
  let attachedConsole = null;
  let originalMethods = null;

  const consoleToLevel = new Map([
    ['log', 'info'],
    ['info', 'info'],
    ['debug', 'debug'],
    ['error', 'error'],
    ['warn', 'error'],
  ]);

  function ensureServiceBuffers(serviceName) {
    if (!buffersByService.has(serviceName)) {
      const levelBuffers = {};
      for (const level of levelSet) {
        levelBuffers[level] = new BoundedBuffer(limitPerLevel);
      }
      buffersByService.set(serviceName, levelBuffers);
    }
    services.add(serviceName);
    return buffersByService.get(serviceName);
  }

  function recordLog(level, args) {
    if (!levelSet.has(level)) {
      return;
    }

    const store = storage.getStore();
    const serviceName = store?.serviceName ?? 'launcher';
    const message = format(...args);
    const entry = {
      sequence: sequence += 1,
      service: serviceName,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    const buffers = ensureServiceBuffers(serviceName);
    buffers[level].push(entry);
  }

  function attachConsole(targetConsole = console) {
    if (attachedConsole) {
      return;
    }
    attachedConsole = targetConsole;
    originalMethods = {};

    for (const methodName of consoleToLevel.keys()) {
      if (typeof targetConsole[methodName] === 'function') {
        originalMethods[methodName] = targetConsole[methodName];
      }
    }

    for (const [methodName, level] of consoleToLevel.entries()) {
      if (typeof originalMethods[methodName] !== 'function') {
        continue;
      }
      targetConsole[methodName] = (...args) => {
        recordLog(level, args);
        return Reflect.apply(originalMethods[methodName], targetConsole, args);
      };
    }
  }

  function restoreConsole() {
    if (!attachedConsole || !originalMethods) {
      return;
    }
    for (const [methodName, original] of Object.entries(originalMethods)) {
      attachedConsole[methodName] = original;
    }
    attachedConsole = null;
    originalMethods = null;
  }

  function getLevels() {
    return [...levelSet];
  }

  function getServiceNames() {
    return [...services].sort();
  }

  function getLogs(filters = {}) {
    const { service, level } = filters;
    const levelsToInclude = level ? [level] : [...levelSet];

    if (level && !levelSet.has(level)) {
      throw new RangeError(`Nivel de log inválido: ${level}`);
    }

    const serviceNames = service ? [service] : [...buffersByService.keys()];
    const entries = [];

    for (const serviceName of serviceNames) {
      const buffers = buffersByService.get(serviceName);
      if (!buffers) {
        continue;
      }
      for (const levelName of levelsToInclude) {
        const buffer = buffers[levelName];
        if (!buffer) {
          continue;
        }
        entries.push(...buffer.values());
      }
    }

    entries.sort((a, b) => a.sequence - b.sequence);
    return entries.map((entry) => ({ ...entry }));
  }

  function withServiceContext(serviceName, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('El callback debe ser una función');
    }
    const normalized = normalizeServiceName(serviceName);
    return storage.run({ serviceName: normalized }, callback);
  }

  return {
    attachConsole,
    restoreConsole,
    getLevels,
    getLogs,
    getServiceNames,
    withServiceContext,
  };
}

module.exports = { createServiceLogCollector };
