'use strict';

const http = require('node:http');
const { once } = require('node:events');
const { createLauncherApp } = require('./create-app');
const { createDashboardHTML } = require('./dashboard-files');
const { startNosqlService } = require('../../../sistemas/nosql-db/src/server');
const { startEventBusService } = require('../../../sistemas/event-bus/src/server');

async function startLauncher(options = {}) {
  const {
    port = 3000,
    host = '127.0.0.1',
    startSystems = true,
    systemsConfig = {},
  } = options;

  const launchedSystems = [];
  let nosqlService = null;
  let eventBusService = null;

  if (startSystems) {
    nosqlService = await startNosqlService({ ...(systemsConfig.nosqlDb ?? {}) });
    launchedSystems.push(nosqlService);

    const eventBusOptions = systemsConfig.eventBus ?? {};
    if (eventBusOptions.startService !== false) {
      const { startService: _ignored, ...serviceOptions } = eventBusOptions;
      eventBusService = await startEventBusService(serviceOptions);
      launchedSystems.push(eventBusService);
    }
  }

  const app = createLauncherApp({
    runtimeSystems: { nosql: nosqlService, eventBus: eventBusService },
    systemsConfig,
  });

  const server = http.createServer(app);
  server.listen(port, host);
  await once(server, 'listening');

  const addressInfo = server.address();
  const resolvedHost = addressInfo.address === '::' ? 'localhost' : addressInfo.address;
  const url = `http://${resolvedHost}:${addressInfo.port}/`;

  const closeServer = () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  const close = async () => {
    await Promise.allSettled(launchedSystems.map((system) => system.close()));
    await closeServer();
  };

  return { url, close, server, systems: { nosql: nosqlService, eventBus: eventBusService } };
}

module.exports = {
  startLauncher,
  createDashboardHTML,
};
