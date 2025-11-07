'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function requireFunction(modulePath, exportName, description) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const moduleExports = require(modulePath);
  const resolved = exportName ? moduleExports[exportName] : moduleExports;
  if (typeof resolved !== 'function') {
    throw new Error(
      `No se pudo cargar la función ${description} desde ${modulePath}${exportName ? `#${exportName}` : ''}`,
    );
  }
  return resolved;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`No se pudo leer ${filePath}: ${error.message}`);
  }
}

async function loadSystemDescriptors(baseDir) {
  const descriptors = [];

  let entries = [];
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return descriptors;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const systemDir = path.join(baseDir, entry.name);
    const configPath = path.join(systemDir, 'launcher.json');
    const config = await readJsonIfExists(configPath);
    if (!config || config.type !== 'system') {
      continue;
    }

    const startModulePath = path.resolve(systemDir, config.startModule ?? './src/index.js');
    const start = requireFunction(startModulePath, config.startExport, 'de arranque del sistema');

    descriptors.push({
      id: config.id ?? entry.name,
      configKey: config.configKey ?? entry.name,
      start,
      expose: config.expose ?? {},
      defaults: config.defaults ?? {},
      dir: systemDir,
      rawConfig: config,
    });
  }

  return descriptors;
}

function createDomainServiceDescriptor(config, serviceDir) {
  if (!config.configDomainKey || !config.configServiceKey) {
    throw new Error(
      `La configuración de ${serviceDir} debe definir configDomainKey y configServiceKey para el servicio de dominio`,
    );
  }

  const startModulePath = path.resolve(serviceDir, config.startModule ?? './src/index.js');
  const start = requireFunction(startModulePath, config.startExport, 'de arranque del servicio de dominio');

  return {
    id: config.id ?? path.basename(serviceDir),
    configDomainKey: config.configDomainKey,
    configServiceKey: config.configServiceKey,
    start,
    dependencies: Array.isArray(config.dependencies) ? config.dependencies : [],
    expose: config.expose ?? {},
    defaults: config.defaults ?? {},
    dir: serviceDir,
    rawConfig: config,
  };
}

function createMicrofrontDescriptor(config, serviceDir) {
  if (!config.widgetRoute) {
    throw new Error(`El microfront ${serviceDir} debe definir widgetRoute en su launcher.json`);
  }

  const modulePath = path.resolve(serviceDir, config.module ?? './src/index.js');
  const render = requireFunction(modulePath, config.renderExport ?? 'renderWidgetShell', 'de renderizado del widget');

  const clientSourcePath = path.resolve(serviceDir, config.clientSource ?? './src/widget-client.jsx');

  // eslint-disable-next-line import/no-dynamic-require, global-require
  const moduleExports = require(modulePath);
  const clientRoute = config.clientRoute ?? moduleExports[config.clientExport ?? 'WIDGET_CLIENT_PATH'];
  if (!clientRoute) {
    throw new Error(`El microfront ${serviceDir} no define clientRoute ni exporta el identificador del cliente`);
  }

  return {
    id: config.id ?? path.basename(serviceDir),
    widgetRoute: config.widgetRoute,
    clientRoute,
    clientSourcePath,
    clientContentType: config.clientContentType ?? 'application/javascript',
    render,
    parameters: config.parameters ?? {},
    dir: serviceDir,
    rawConfig: config,
  };
}

async function loadDomainArtifacts(domainsDir) {
  const domainServices = [];
  const microfronts = [];

  let domainEntries = [];
  try {
    domainEntries = await fs.readdir(domainsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { domainServices, microfronts };
    }
    throw error;
  }

  for (const domainEntry of domainEntries) {
    if (!domainEntry.isDirectory()) {
      continue;
    }

    const servicesDir = path.join(domainsDir, domainEntry.name, 'servicios');

    let serviceEntries = [];
    try {
      serviceEntries = await fs.readdir(servicesDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const serviceEntry of serviceEntries) {
      if (!serviceEntry.isDirectory()) {
        continue;
      }

      const serviceDir = path.join(servicesDir, serviceEntry.name);
      const configPath = path.join(serviceDir, 'launcher.json');
      const config = await readJsonIfExists(configPath);
      if (!config) {
        continue;
      }

      if (config.type === 'domain-service') {
        domainServices.push(createDomainServiceDescriptor(config, serviceDir));
        continue;
      }

      if (config.type === 'microfront') {
        microfronts.push(createMicrofrontDescriptor(config, serviceDir));
      }
    }
  }

  return { domainServices, microfronts };
}

async function loadLauncherArtifacts(options = {}) {
  const rootDir = options.rootDir ?? path.resolve(__dirname, '..', '..');
  const systemsDir = path.join(rootDir, 'sistemas');
  const domainsDir = path.join(rootDir, 'dominios');

  const systems = await loadSystemDescriptors(systemsDir);
  const { domainServices, microfronts } = await loadDomainArtifacts(domainsDir);

  const systemsById = new Map();
  const systemsByConfigKey = new Map();
  for (const system of systems) {
    systemsById.set(system.id, system);
    systemsByConfigKey.set(system.configKey, system);
  }

  const domainServicesByKey = new Map();
  for (const service of domainServices) {
    domainServicesByKey.set(`${service.configDomainKey}.${service.configServiceKey}`, service);
  }

  return {
    systems,
    systemsById,
    systemsByConfigKey,
    domainServices,
    domainServicesByKey,
    microfronts,
  };
}

module.exports = {
  loadLauncherArtifacts,
};
