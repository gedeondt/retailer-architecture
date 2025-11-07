'use strict';

const { resolveFirstValue } = require('../../lib/launcher/value-resolver');

function toRuntimeMap(value) {
  if (value instanceof Map) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return new Map();
  }

  return new Map(Object.entries(value));
}

function buildLauncherConfig({
  systemDescriptors = [],
  domainServiceDescriptors = [],
  runtimeSystemsById = new Map(),
  runtimeDomains = {},
  systemsConfig = {},
  domainServicesConfig = {},
}) {
  const runtimeSystems = toRuntimeMap(runtimeSystemsById);
  const config = {};

  const systemsPayload = {};
  for (const descriptor of systemDescriptors) {
    const runtime = runtimeSystems.get(descriptor.id);
    const configEntry = systemsConfig?.[descriptor.configKey] ?? {};
    const expose = descriptor.expose ?? {};
    const defaults = descriptor.defaults ?? {};

    const payload = {};
    for (const [field, sources] of Object.entries(expose)) {
      let value = resolveFirstValue(sources, { runtime, config: configEntry, defaults });
      if (typeof value === 'string') {
        value = value.trim();
      }
      if (value !== undefined && value !== null && value !== '') {
        payload[field] = value;
      }
    }

    if (Object.keys(payload).length > 0) {
      systemsPayload[descriptor.configKey] = payload;
    }
  }

  if (Object.keys(systemsPayload).length > 0) {
    config.systems = systemsPayload;
  }

  const domainsPayload = {};
  for (const descriptor of domainServiceDescriptors) {
    const domainKey = descriptor.configDomainKey;
    const serviceKey = descriptor.configServiceKey;
    const runtime = runtimeDomains?.[domainKey]?.[serviceKey];
    const configEntry = domainServicesConfig?.[domainKey]?.[serviceKey] ?? {};
    const expose = descriptor.expose ?? {};
    const defaults = descriptor.defaults ?? {};

    const payload = {};
    for (const [field, sources] of Object.entries(expose)) {
      let value = resolveFirstValue(sources, { runtime, config: configEntry, defaults });
      if (typeof value === 'string') {
        value = value.trim();
      }
      if (value !== undefined && value !== null && value !== '') {
        payload[field] = value;
      }
    }

    if (Object.keys(payload).length > 0) {
      if (!domainsPayload[domainKey]) {
        domainsPayload[domainKey] = {};
      }
      domainsPayload[domainKey][serviceKey] = payload;
    }
  }

  if (Object.keys(domainsPayload).length > 0) {
    config.domains = domainsPayload;
  }

  if (Object.keys(config).length === 0) {
    return {};
  }

  return config;
}

function injectLauncherConfig(html, configObject) {
  if (!configObject || Object.keys(configObject).length === 0) {
    return html;
  }

  const serialized = JSON.stringify(configObject);
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

module.exports = {
  buildLauncherConfig,
  injectLauncherConfig,
};
