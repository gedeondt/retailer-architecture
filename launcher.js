'use strict';

const { startDashboardServer, createDashboardHTML } = require('./frontales/launcher-dashboard/src/server');
const { startNosqlService } = require('./sistemas/nosql-db/src/server');
const { startEventBusService } = require('./sistemas/event-bus/src/server');
const { startCheckoutService } = require('./dominios/ventasdigitales/servicios/ecommerce-api/src');
const { startCrmService } = require('./dominios/atencion-al-cliente/servicios/crm-backend/src');
const { createServiceLogCollector } = require('./lib/logging/service-log-collector');

async function startLauncher(options = {}) {
  const {
    port = 3000,
    host = '127.0.0.1',
    startSystems = true,
    startDomainServices = startSystems,
    systemsConfig = {},
    domainServicesConfig = {},
    logBufferLimit = 100,
  } = options;

  const logCollector = createServiceLogCollector({ limitPerLevel: logBufferLimit });
  logCollector.attachConsole(console);

  const launchedSystems = [];
  const launchedDomainServices = [];
  let nosqlService = null;
  let eventBusService = null;
  let ecommerceApiService = null;
  let crmService = null;

  try {
    if (startSystems) {
      nosqlService = await logCollector.withServiceContext('nosql-db', () =>
        startNosqlService({ ...(systemsConfig.nosqlDb ?? {}) }),
      );
      launchedSystems.push(nosqlService);

      const eventBusOptions = systemsConfig.eventBus ?? {};
      if (eventBusOptions.startService !== false) {
        const { startService: _ignored, ...serviceOptions } = eventBusOptions;
        eventBusService = await logCollector.withServiceContext('event-bus', () =>
          startEventBusService(serviceOptions),
        );
        launchedSystems.push(eventBusService);
      }
    }

    if (startDomainServices) {
      const ventasDigitalesConfig = domainServicesConfig.ventasDigitales ?? {};
      const ecommerceConfig = ventasDigitalesConfig.ecommerceApi ?? {};
      if (ecommerceConfig.startService !== false) {
        const { startService: _ignored, ...serviceOptions } = ecommerceConfig;

        const nosqlUrl =
          serviceOptions.nosqlUrl ??
          nosqlService?.url ??
          systemsConfig?.nosqlDb?.apiOrigin ??
          systemsConfig?.nosqlDb?.widgetOrigin;
        const eventBusUrl =
          serviceOptions.eventBusUrl ??
          eventBusService?.url ??
          systemsConfig?.eventBus?.apiOrigin ??
          systemsConfig?.eventBus?.widgetOrigin;

        if (!nosqlUrl) {
          throw new Error(
            'No se pudo determinar la URL del servicio NoSQL para iniciar ventasdigitales-ecommerce-api.',
          );
        }

        if (!eventBusUrl) {
          throw new Error(
            'No se pudo determinar la URL del Event Bus para iniciar ventasdigitales-ecommerce-api.',
          );
        }

        ecommerceApiService = await logCollector.withServiceContext('ventasdigitales-ecommerce-api', () =>
          startCheckoutService({ ...serviceOptions, nosqlUrl, eventBusUrl }),
        );
        launchedDomainServices.push(ecommerceApiService);
      }

      const atencionConfig = domainServicesConfig.atencionAlCliente ?? {};
      const crmConfig = atencionConfig.crmBackend ?? {};
      if (crmConfig.startService !== false) {
        const { startService: _ignoredCrm, ...serviceOptions } = crmConfig;

        const crmNosqlUrl =
          serviceOptions.nosqlUrl ??
          nosqlService?.url ??
          systemsConfig?.nosqlDb?.apiOrigin ??
          systemsConfig?.nosqlDb?.widgetOrigin;
        const crmEventBusUrl =
          serviceOptions.eventBusUrl ??
          eventBusService?.url ??
          systemsConfig?.eventBus?.apiOrigin ??
          systemsConfig?.eventBus?.widgetOrigin;

        if (!crmNosqlUrl) {
          throw new Error(
            'No se pudo determinar la URL del servicio NoSQL para iniciar atencionalcliente-crm-backend.',
          );
        }

        if (!crmEventBusUrl) {
          throw new Error(
            'No se pudo determinar la URL del Event Bus para iniciar atencionalcliente-crm-backend.',
          );
        }

        crmService = await logCollector.withServiceContext('atencionalcliente-crm-backend', () =>
          startCrmService({ ...serviceOptions, nosqlUrl: crmNosqlUrl, eventBusUrl: crmEventBusUrl }),
        );
        launchedDomainServices.push(crmService);
      }
    }

    const runtimeDomains = {};
    if (ecommerceApiService) {
      runtimeDomains.ventasDigitales = { ecommerceApi: ecommerceApiService };
    }
    if (crmService) {
      runtimeDomains.atencionAlCliente = { crmBackend: crmService };
    }

    const { url, close: closeServer, server } = await logCollector.withServiceContext(
      'launcher-dashboard',
      () =>
        startDashboardServer({
          port,
          host,
          runtimeSystems: { nosql: nosqlService, eventBus: eventBusService },
          runtimeDomains,
          systemsConfig,
          domainServicesConfig,
          logCollector,
        }),
    );

    const close = async () => {
      try {
        await Promise.allSettled([
          ...launchedSystems.map((system) => system.close()),
          ...launchedDomainServices.map((service) => service.close()),
        ]);
        await closeServer();
      } finally {
        logCollector.restoreConsole();
      }
    };

    return {
      url,
      close,
      server,
      systems: { nosql: nosqlService, eventBus: eventBusService },
      domains: runtimeDomains,
      logs: logCollector,
    };
  } catch (error) {
    logCollector.restoreConsole();
    throw error;
  }
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
