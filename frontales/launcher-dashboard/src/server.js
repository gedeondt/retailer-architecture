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
    systemsConfig = {},
    dashboardDir,
  } = options;

  const app = createLauncherApp({ runtimeSystems, systemsConfig, dashboardDir });

  const server = http.createServer(app);
  server.listen(port, host);
  await once(server, 'listening');

  const addressInfo = server.address();
  const resolvedHost = addressInfo.address === '::' ? 'localhost' : addressInfo.address;
  const url = `http://${resolvedHost}:${addressInfo.port}/`;

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
