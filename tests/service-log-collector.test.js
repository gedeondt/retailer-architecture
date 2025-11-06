'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createServiceLogCollector } = require('../lib/logging/service-log-collector');

function createFakeConsole() {
  const calls = [];
  const stub = (method) => (...args) => {
    calls.push({ method, args });
  };
  return {
    log: stub('log'),
    info: stub('info'),
    debug: stub('debug'),
    error: stub('error'),
    warn: stub('warn'),
    calls,
  };
}

test('ServiceLogCollector limita los logs por nivel y servicio', async () => {
  const fakeConsole = createFakeConsole();
  const collector = createServiceLogCollector({ limitPerLevel: 2 });
  collector.attachConsole(fakeConsole);

  await collector.withServiceContext('servicio-a', async () => {
    fakeConsole.log('info 1');
    fakeConsole.log('info 2');
    fakeConsole.log('info 3');
    fakeConsole.debug('debug 1');
  });

  const infoLogs = collector.getLogs({ service: 'servicio-a', level: 'info' });
  assert.equal(infoLogs.length, 2);
  assert.deepEqual(
    infoLogs.map((entry) => entry.message),
    ['info 2', 'info 3'],
    'mantiene solo los últimos elementos por límite',
  );

  const debugLogs = collector.getLogs({ service: 'servicio-a', level: 'debug' });
  assert.equal(debugLogs.length, 1);
  assert.equal(debugLogs[0].message, 'debug 1');

  collector.restoreConsole();
});

test('ServiceLogCollector mantiene el contexto asincrónico por servicio', async () => {
  const fakeConsole = createFakeConsole();
  const collector = createServiceLogCollector({ limitPerLevel: 5 });
  collector.attachConsole(fakeConsole);

  await collector.withServiceContext('servicio-async', async () => {
    await new Promise((resolve) => {
      setTimeout(() => {
        fakeConsole.error('fallo async');
        resolve();
      }, 10);
    });
  });

  const logs = collector.getLogs({ service: 'servicio-async', level: 'error' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].service, 'servicio-async');

  collector.restoreConsole();
});

test('ServiceLogCollector expone servicios y niveles disponibles', () => {
  const fakeConsole = createFakeConsole();
  const collector = createServiceLogCollector({ limitPerLevel: 3 });
  collector.attachConsole(fakeConsole);

  fakeConsole.log('log launcher');

  collector.withServiceContext('servicio-extra', () => {
    fakeConsole.error('fallo');
  });

  const services = collector.getServiceNames();
  assert.ok(services.includes('launcher'));
  assert.ok(services.includes('servicio-extra'));

  const allLogs = collector.getLogs();
  assert.equal(allLogs.length, 2);
  assert.deepEqual(collector.getLevels().sort(), ['debug', 'error', 'info']);

  collector.restoreConsole();
});
