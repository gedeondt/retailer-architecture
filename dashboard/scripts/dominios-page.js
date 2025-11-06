import dashboardWidgets from './widget-loader.js';

function initDominiosWidgets() {
  const baseOrigin = window.location.origin.replace(/\/$/, '');
  const defaultApiOrigin = 'http://127.0.0.1:4300';
  dashboardWidgets.mountWidget({
    slotId: 'ventasdigitales-ecommerce-widget-slot',
    defaultWidgetOrigin: `${baseOrigin}/widgets/ventasdigitales/ecommerce/`,
    defaultApiOrigin,
    errorTitle: 'Widget Ecommerce no disponible',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDominiosWidgets, { once: true });
} else {
  initDominiosWidgets();
}
