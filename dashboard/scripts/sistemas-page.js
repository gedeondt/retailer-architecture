import dashboardWidgets from './widget-loader.js';

function initSistemasWidgets() {
  dashboardWidgets.mountWidget({
    slotId: 'nosql-db-widget-slot',
    systemKey: 'nosqlDb',
    defaultWidgetOrigin: 'http://127.0.0.1:4100',
    errorTitle: 'Widget NoSQL no disponible',
  });

  dashboardWidgets.mountWidget({
    slotId: 'event-bus-widget-slot',
    systemKey: 'eventBus',
    defaultWidgetOrigin: 'http://127.0.0.1:4200',
    defaultChannel: 'general',
    errorTitle: 'Widget Event Bus no disponible',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSistemasWidgets, { once: true });
} else {
  initSistemasWidgets();
}
