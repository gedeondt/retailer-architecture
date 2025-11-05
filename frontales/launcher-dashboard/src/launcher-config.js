'use strict';

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

module.exports = {
  buildLauncherConfig,
  injectLauncherConfig,
};
