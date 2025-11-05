'use strict';

const { startDashboardServer, createDashboardHTML } = require('./frontales/launcher-dashboard/src/server');
const { startNosqlService } = require('./sistemas/nosql-db/src/server');
const { startEventBusService } = require('./sistemas/event-bus/src/server');

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

  const { url, close: closeServer, server } = await startDashboardServer({
    port,
    host,
    runtimeSystems: { nosql: nosqlService, eventBus: eventBusService },
    systemsConfig,
  });

  const close = async () => {
    await Promise.allSettled(launchedSystems.map((system) => system.close()));
    await closeServer();
  };

  return { url, close, server, systems: { nosql: nosqlService, eventBus: eventBusService } };
}

module.exports = {
  startLauncher,
  startDashboardServer,
  createDashboardHTML,
};

if (require.main === module) {
  startLauncher()
    .then(({ url }) => {
      // eslint-disable-next-line no-console
      console.log(`Dashboard disponible en ${url}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error al iniciar el launcher', error);
      process.exitCode = 1;
    });
}
