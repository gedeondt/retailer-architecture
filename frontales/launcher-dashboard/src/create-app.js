'use strict';

const express = require('express');
const { getDashboardDir, resolveDashboardPage, readDashboardPage } = require('./dashboard-files');
const { buildLauncherConfig, injectLauncherConfig } = require('./launcher-config');

function createLauncherApp(options = {}) {
  const {
    runtimeSystems = {},
    systemsConfig = {},
    dashboardDir = getDashboardDir(),
  } = options;

  const app = express();

  app.disable('x-powered-by');

  app.use('/dashboard', express.static(dashboardDir));

  app.get(['/', '/index.html'], (_req, res, next) => {
    try {
      const html = readDashboardPage('index.html');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get(['/dominios', '/dominios.html'], (_req, res, next) => {
    try {
      const html = readDashboardPage('dominios.html');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get(['/sistemas', '/sistemas.html'], (_req, res, next) => {
    try {
      const html = readDashboardPage('sistemas.html');
      const launcherConfig = buildLauncherConfig({
        nosqlService: runtimeSystems.nosql,
        eventBusService: runtimeSystems.eventBus,
        systemsConfig,
      });
      const enhancedHtml = injectLauncherConfig(html, launcherConfig);
      res.type('html').send(enhancedHtml);
    } catch (error) {
      next(error);
    }
  });

  app.get('*', (req, res, next) => {
    const page = resolveDashboardPage(req.path);
    if (page) {
      try {
        const html = readDashboardPage(page);
        res.type('html').send(html);
      } catch (error) {
        next(error);
      }
      return;
    }

    res.status(404).type('text/plain; charset=utf-8').send('No encontrado');
  });

  app.use((error, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error('Error en launcher dashboard', error);
    res.status(500).type('text/plain; charset=utf-8').send('Error interno del servidor');
  });

  return app;
}

module.exports = { createLauncherApp };
