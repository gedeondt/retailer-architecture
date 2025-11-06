import dashboardWidgets from './widget-loader.js';

function initDominiosWidgets() {
  const baseOrigin = window.location.origin.replace(/\/$/, '');
  const launcherConfig = window.__LAUNCHER_CONFIG__ || {};
  const ecommerceConfig = launcherConfig.domains?.ventasDigitales?.ecommerceApi ?? {};
  const defaultApiOrigin = ecommerceConfig.apiOrigin || 'http://127.0.0.1:4300';
  dashboardWidgets.mountWidget({
    slotId: 'ventasdigitales-ecommerce-widget-slot',
    defaultWidgetOrigin: `${baseOrigin}/widgets/ventasdigitales/ecommerce/`,
    defaultApiOrigin,
    errorTitle: 'Widget Ecommerce no disponible',
  });

  const crmConfig = launcherConfig.domains?.atencionAlCliente?.crmBackend ?? {};
  const defaultCrmApiOrigin = crmConfig.apiOrigin || 'http://127.0.0.1:4400';
  dashboardWidgets.mountWidget({
    slotId: 'atencionalcliente-crm-widget-slot',
    defaultWidgetOrigin: `${baseOrigin}/widgets/atencionalcliente/crm/`,
    defaultApiOrigin: defaultCrmApiOrigin,
    errorTitle: 'Widget CRM no disponible',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDominiosWidgets, { once: true });
} else {
  initDominiosWidgets();
}
