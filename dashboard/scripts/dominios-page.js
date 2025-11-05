import dashboardWidgets from './widget-loader.js';

function initDominiosWidgets() {
  const baseOrigin = window.location.origin.replace(/\/$/, '');
  dashboardWidgets.mountWidget({
    slotId: 'ventasdigitales-ecommerce-widget-slot',
    defaultWidgetOrigin: `${baseOrigin}/widgets/ventasdigitales/ecommerce/`,
    errorTitle: 'Widget Ecommerce no disponible',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDominiosWidgets, { once: true });
} else {
  initDominiosWidgets();
}
