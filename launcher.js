'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { once } = require('node:events');
const { startNosqlService } = require('./sistemas/nosql-db/src/server');
const { startEventBusService } = require('./sistemas/event-bus/src/server');

const DASHBOARD_DIR = path.join(__dirname, 'dashboard');
const PAGE_MAP = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/dominios', 'dominios.html'],
  ['/dominios.html', 'dominios.html'],
  ['/sistemas', 'sistemas.html'],
  ['/sistemas.html', 'sistemas.html'],
]);

const pageCache = new Map();

function readPageSync(filename) {
  const cached = pageCache.get(filename);
  if (cached) {
    return cached;
  }

  const filePath = path.join(DASHBOARD_DIR, filename);
  const html = fs.readFileSync(filePath, 'utf8');
  pageCache.set(filename, html);
  return html;
}

function buildLauncherConfig({ nosqlService, eventBusService, systemsConfig }) {
  const systems = {};

  const providedNosql = systemsConfig?.nosqlDb ?? {};
  const nosqlWidgetOrigin = nosqlService?.url ?? providedNosql.widgetOrigin;
  const nosqlApiOrigin = providedNosql.apiOrigin ?? nosqlWidgetOrigin;

  if (nosqlWidgetOrigin || nosqlApiOrigin) {
    systems.nosqlDb = {};
    if (nosqlWidgetOrigin) {
      systems.nosqlDb.widgetOrigin = nosqlWidgetOrigin;
    }
    if (nosqlApiOrigin) {
      systems.nosqlDb.apiOrigin = nosqlApiOrigin;
    }
  }

  const providedEventBus = systemsConfig?.eventBus ?? {};
  const eventBusWidgetOrigin = eventBusService?.url ?? providedEventBus.widgetOrigin;
  const eventBusApiOrigin = providedEventBus.apiOrigin ?? eventBusWidgetOrigin;

  if (eventBusWidgetOrigin || eventBusApiOrigin) {
    systems.eventBus = {};
    if (eventBusWidgetOrigin) {
      systems.eventBus.widgetOrigin = eventBusWidgetOrigin;
    }
    if (eventBusApiOrigin) {
      systems.eventBus.apiOrigin = eventBusApiOrigin;
    }
  }

  if (Object.keys(systems).length === 0) {
    return {};
  }

  return { systems };
}

function injectLauncherConfig(html, config) {
  if (!config || Object.keys(config).length === 0) {
    return html;
  }

  const serialized = JSON.stringify(config);
  const configScript = `<script>window.__LAUNCHER_CONFIG__ = ${serialized};</script>`;
  const marker = '<script type="module">';

  if (html.includes(marker)) {
    return html.replace(marker, `${configScript}\n    ${marker}`);
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `    ${configScript}\n  </body>`);
  }

  return `${html}\n${configScript}`;
}

function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function createDashboardHTML() {
  return readPageSync('index.html');
}

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

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Método no permitido');
      return;
    }

    const { pathname } = new URL(req.url, 'http://localhost');
    const normalizedPath = normalizePathname(pathname);
    const pageFilename = PAGE_MAP.get(normalizedPath);

    if (pageFilename) {
      try {
        let html = readPageSync(pageFilename);

        if (pageFilename === 'sistemas.html') {
          const launcherConfig = buildLauncherConfig({ nosqlService, eventBusService, systemsConfig });
          html = injectLauncherConfig(html, launcherConfig);
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error interno del servidor');
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  });

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

if (require.main === module) {
  startLauncher()
    .then(({ url }) => {
      console.log(`Dashboard disponible en ${url}`);
    })
    .catch((error) => {
      console.error('Error al iniciar el launcher', error);
      process.exitCode = 1;
    });
}
