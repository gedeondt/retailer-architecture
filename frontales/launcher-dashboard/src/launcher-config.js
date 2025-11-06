'use strict';

function buildLauncherConfig({
  nosqlService,
  eventBusService,
  systemsConfig,
  domainServices,
  domainServicesConfig,
}) {
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
  const eventBusChannel = providedEventBus.channel;

  if (eventBusWidgetOrigin || eventBusApiOrigin) {
    systems.eventBus = {};
    if (eventBusWidgetOrigin) {
      systems.eventBus.widgetOrigin = eventBusWidgetOrigin;
    }
    if (eventBusApiOrigin) {
      systems.eventBus.apiOrigin = eventBusApiOrigin;
    }
    if (eventBusChannel) {
      systems.eventBus.channel = eventBusChannel;
    }
  }

  const domains = {};

  const providedEcommerce = domainServicesConfig?.ventasDigitales?.ecommerceApi ?? {};
  const ecommerceApiOrigin = providedEcommerce.apiOrigin ?? domainServices?.ventasDigitales?.ecommerceApi?.url;

  if (ecommerceApiOrigin) {
    domains.ventasDigitales = {
      ecommerceApi: {
        apiOrigin: ecommerceApiOrigin,
      },
    };
  }

  const providedCrm = domainServicesConfig?.atencionAlCliente?.crmBackend ?? {};
  const crmApiOrigin = providedCrm.apiOrigin ?? domainServices?.atencionAlCliente?.crmBackend?.url;

  if (crmApiOrigin) {
    domains.atencionAlCliente = {
      crmBackend: {
        apiOrigin: crmApiOrigin,
      },
    };
  }

  const config = {};

  if (Object.keys(systems).length > 0) {
    config.systems = systems;
  }

  if (Object.keys(domains).length > 0) {
    config.domains = domains;
  }

  if (Object.keys(config).length === 0) {
    return {};
  }

  return config;
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

module.exports = {
  buildLauncherConfig,
  injectLauncherConfig,
};
