'use strict';

const path = require('node:path');

const { startDashboardServer, createDashboardHTML } = require('./dashboard/server/server');
const { loadLauncherArtifacts } = require('./lib/launcher/config-loader');
const { resolveFirstValue } = require('./lib/launcher/value-resolver');
const { createServiceLogCollector } = require('./lib/logging/service-log-collector');

function createWidgetHandlers(microfronts, context) {
  const { domainServicesConfig, runtimeDomains } = context;

  return microfronts.map((descriptor) => {
    const buildOptions = (req) => {
      const params = {};
      const sourcesMap = descriptor.parameters ?? {};

      for (const [paramName, sources] of Object.entries(sourcesMap)) {
        const value = resolveFirstValue(sources, {
          query: req?.query,
          domainConfig: domainServicesConfig,
          runtimeDomain: runtimeDomains,
          defaults: descriptor.defaults ?? {},
        });

        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed !== '') {
            params[paramName] = trimmed;
          }
          continue;
        }

        if (value !== undefined) {
          params[paramName] = value;
        }
      }

      return params;
    };

    return {
      id: descriptor.id,
      widgetRoute: descriptor.widgetRoute,
      clientRoute: descriptor.clientRoute,
      clientSourcePath: descriptor.clientSourcePath,
      clientContentType: descriptor.clientContentType,
      render: (req) => descriptor.render(buildOptions(req)),
    };
  });
}

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

  const artifacts = await loadLauncherArtifacts({ rootDir: path.resolve(__dirname) });
  const { systems, systemsById, domainServices, microfronts } = artifacts;

  const launchedSystems = [];
  const launchedDomainServices = [];
  const runtimeSystemsById = new Map();
  const runtimeDomains = {};

  try {
    if (startSystems) {
      for (const systemDescriptor of systems) {
        const systemOptions = systemsConfig?.[systemDescriptor.configKey] ?? {};
        if (systemOptions.startService === false) {
          continue;
        }

        const { startService: _ignored, ...serviceOptions } = systemOptions;
        const instance = await logCollector.withServiceContext(systemDescriptor.id, () =>
          systemDescriptor.start(serviceOptions),
        );

        launchedSystems.push(instance);
        runtimeSystemsById.set(systemDescriptor.id, instance);
      }
    }

    if (startDomainServices) {
      for (const serviceDescriptor of domainServices) {
        const domainConfigSection = domainServicesConfig?.[serviceDescriptor.configDomainKey] ?? {};
        const serviceConfig = domainConfigSection?.[serviceDescriptor.configServiceKey] ?? {};

        if (serviceConfig.startService === false) {
          continue;
        }

        const { startService: _ignored, ...serviceOptions } = serviceConfig;
        const resolvedOptions = { ...serviceOptions };

        for (const dependency of serviceDescriptor.dependencies ?? []) {
          if (dependency.type !== 'system') {
            continue;
          }

          const systemDescriptor = systemsById.get(dependency.id);
          const runtimeDependency = systemDescriptor ? runtimeSystemsById.get(dependency.id) : undefined;
          const dependencyConfig = systemDescriptor
            ? systemsConfig?.[systemDescriptor.configKey] ?? {}
            : {};

          const value = resolveFirstValue(dependency.sources, {
            options: serviceOptions,
            runtime: runtimeDependency,
            config: dependencyConfig,
            defaults: systemDescriptor?.defaults ?? {},
          });

          if (value === undefined) {
            if (dependency.required !== false) {
              throw new Error(
                `No se pudo determinar el parámetro ${dependency.optionsKey} para ` +
                  `${serviceDescriptor.configDomainKey}.${serviceDescriptor.configServiceKey} (dependencia ${dependency.id}).`,
              );
            }
            continue;
          }

          resolvedOptions[dependency.optionsKey] = value;
        }

        const serviceId = `${serviceDescriptor.configDomainKey}-${serviceDescriptor.configServiceKey}`;
        const instance = await logCollector.withServiceContext(serviceId, () =>
          serviceDescriptor.start(resolvedOptions),
        );

        launchedDomainServices.push(instance);

        if (!runtimeDomains[serviceDescriptor.configDomainKey]) {
          runtimeDomains[serviceDescriptor.configDomainKey] = {};
        }
        runtimeDomains[serviceDescriptor.configDomainKey][serviceDescriptor.configServiceKey] = instance;
      }
    }

    const widgetHandlers = createWidgetHandlers(microfronts, {
      domainServicesConfig,
      runtimeDomains,
    });

    const { url, close: closeServer, server } = await logCollector.withServiceContext(
      'launcher-dashboard',
      () =>
        startDashboardServer({
          port,
          host,
          systemDescriptors: systems,
          domainServiceDescriptors: domainServices,
          runtimeSystemsById,
          runtimeDomains,
          systemsConfig,
          domainServicesConfig,
          widgets: widgetHandlers,
          logCollector,
        }),
    );

    const close = async () => {
      try {
        await Promise.allSettled([
          ...launchedSystems.map((system) => system?.close?.()).filter(Boolean),
          ...launchedDomainServices.map((service) => service?.close?.()).filter(Boolean),
        ]);
        await closeServer();
      } finally {
        logCollector.restoreConsole();
      }
    };

    const systemsRuntime = {};
    for (const systemDescriptor of systems) {
      const instance = runtimeSystemsById.get(systemDescriptor.id);
      if (instance) {
        systemsRuntime[systemDescriptor.configKey] = instance;
      }
    }

    return {
      url,
      close,
      server,
      systems: systemsRuntime,
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
