'use strict';

const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { getDashboardDir, resolveDashboardPage, readDashboardPage } = require('./dashboard-files');
const { buildLauncherConfig, injectLauncherConfig } = require('./launcher-config');
const {
  renderWidgetShell: renderEcommerceWidget,
} = require('../../../dominios/ventasdigitales/servicios/ecommerce/src');
const {
  renderWidgetShell: renderCrmWidget,
} = require('../../../dominios/atencion-al-cliente/servicios/crm-frontend/src');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const ECOMMERCE_WIDGET_CLIENT = path.join(
  ROOT_DIR,
  'dominios',
  'ventasdigitales',
  'servicios',
  'ecommerce',
  'src',
  'widget-client.jsx',
);
const CRM_WIDGET_CLIENT = path.join(
  ROOT_DIR,
  'dominios',
  'atencion-al-cliente',
  'servicios',
  'crm-frontend',
  'src',
  'widget-client.jsx',
);
const LOG_PREFIX = '[launcher-dashboard]';

function logError(message, ...args) {
  // eslint-disable-next-line no-console
  console.error(`${LOG_PREFIX} ${message}`, ...args);
}

function createLauncherApp(options = {}) {
  const {
    runtimeSystems = {},
    runtimeDomains = {},
    systemsConfig = {},
    domainServicesConfig = {},
    dashboardDir = getDashboardDir(),
    logCollector,
  } = options;

  const app = express();

  app.disable('x-powered-by');

  app.use('/dashboard', express.static(dashboardDir));

  app.get('/api/logs', (req, res) => {
    if (!logCollector) {
      res.status(503).json({ message: 'El registro de logs no está disponible' });
      return;
    }

    const rawService = typeof req.query?.service === 'string' ? req.query.service : undefined;
    const rawLevel = typeof req.query?.level === 'string' ? req.query.level : undefined;

    const service = rawService && rawService.trim() !== '' ? rawService.trim() : undefined;
    const level = rawLevel && rawLevel.trim() !== '' ? rawLevel.trim() : undefined;

    if (level && !logCollector.getLevels().includes(level)) {
      res
        .status(400)
        .json({ message: `Nivel de log inválido: ${level}. Valores permitidos: ${logCollector.getLevels().join(', ')}` });
      return;
    }

    const items = logCollector.getLogs({ service, level });
    res.json({
      items,
      totalItems: items.length,
      services: logCollector.getServiceNames(),
      levels: logCollector.getLevels(),
    });
  });

  app.get('/widgets/ventasdigitales/ecommerce/widget', (req, res, next) => {
    try {
      const apiOriginRaw = typeof req.query?.apiOrigin === 'string' ? req.query.apiOrigin : undefined;
      const runtimeApiOrigin = runtimeDomains?.ventasDigitales?.ecommerceApi?.url;
      const providedApiOrigin =
        domainServicesConfig?.ventasDigitales?.ecommerceApi?.apiOrigin ?? runtimeApiOrigin;
      const apiOrigin =
        apiOriginRaw && apiOriginRaw.trim() !== '' ? apiOriginRaw : providedApiOrigin ?? undefined;
      const html = renderEcommerceWidget({ apiOrigin });
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get('/widgets/ventasdigitales/ecommerce/widget-client.jsx', async (_req, res, next) => {
    try {
      const source = await fs.readFile(ECOMMERCE_WIDGET_CLIENT, 'utf8');
      res.type('application/javascript').send(source);
    } catch (error) {
      next(error);
    }
  });

  app.get('/widgets/atencionalcliente/crm/widget', (req, res, next) => {
    try {
      const apiOriginRaw = typeof req.query?.apiOrigin === 'string' ? req.query.apiOrigin : undefined;
      const runtimeApiOrigin = runtimeDomains?.atencionAlCliente?.crmBackend?.url;
      const providedApiOrigin =
        domainServicesConfig?.atencionAlCliente?.crmBackend?.apiOrigin ?? runtimeApiOrigin;
      const apiOrigin =
        apiOriginRaw && apiOriginRaw.trim() !== '' ? apiOriginRaw : providedApiOrigin ?? undefined;
      const html = renderCrmWidget({ apiOrigin });
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get('/widgets/atencionalcliente/crm/widget-client.jsx', async (_req, res, next) => {
    try {
      const source = await fs.readFile(CRM_WIDGET_CLIENT, 'utf8');
      res.type('application/javascript').send(source);
    } catch (error) {
      next(error);
    }
  });

  app.get(['/', '/index.html', '/dominios', '/dominios.html'], (_req, res, next) => {
    try {
      const html = readDashboardPage('index.html');
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
        domainServices: runtimeDomains,
        domainServicesConfig,
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
    logError('Error en launcher dashboard', error);
    res.status(500).type('text/plain; charset=utf-8').send('Error interno del servidor');
  });

  return app;
}

module.exports = { createLauncherApp };
