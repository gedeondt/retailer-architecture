'use strict';

const http = require('node:http');
const { once } = require('node:events');
const { createLauncherApp } = require('./create-app');
const { createDashboardHTML } = require('./dashboard-files');

async function startDashboardServer(options = {}) {
  const {
    port = 3000,
    host = '127.0.0.1',
    runtimeSystems = {},
    runtimeDomains = {},
    systemsConfig = {},
    domainServicesConfig = {},
    dashboardDir,
    logCollector,
  } = options;

  const app = createLauncherApp({
    runtimeSystems,
    runtimeDomains,
    systemsConfig,
    domainServicesConfig,
    dashboardDir,
    logCollector,
  });

  const server = http.createServer(app);
  server.listen(port, host);
  await once(server, 'listening');

  const addressInfo = server.address();
  const resolvedHost = addressInfo.address === '::' ? 'localhost' : addressInfo.address;
  const url = `http://${resolvedHost}:${addressInfo.port}/`;

  // eslint-disable-next-line no-console
  console.info('[launcher-dashboard] Servidor escuchando en %s:%d', resolvedHost, addressInfo.port);

  const close = () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return { url, close, server };
}

module.exports = {
  startDashboardServer,
  createDashboardHTML,
};
