'use strict';

const WIDGET_ID = 'atencionalcliente-crm';
const WIDGET_SIZE = '2';
const WIDGET_CLIENT_PATH = '/widgets/atencionalcliente/crm/widget-client.jsx';
const ROOT_ID = 'atencionalcliente-crm-root';

function escapeAttribute(value) {
  return String(value).replace(/"/g, '&quot;');
}

function renderWidgetShell(options = {}) {
  const { apiOrigin } = options;
  const rootAttributes = [`id="${ROOT_ID}"`];

  if (apiOrigin) {
    rootAttributes.push(`data-api-origin="${escapeAttribute(apiOrigin)}"`);
  }

  return [
    `<section data-widget-id="${WIDGET_ID}" data-widget-size="${WIDGET_SIZE}" class="col-span-1 sm:col-span-2 xl:col-span-2">`,
    '  <div class="bg-white rounded-xl shadow-lg border border-slate-200 h-full overflow-hidden">',
    '    <div class="h-full flex flex-col">',
    `      <div ${rootAttributes.join(' ')} class="flex-1"></div>`,
    '    </div>',
    '  </div>',
    '</section>',
    `<script type="text/babel" data-presets="react" src="${WIDGET_CLIENT_PATH}"></script>`,
  ].join('\n');
}

module.exports = {
  renderWidgetShell,
  WIDGET_CLIENT_PATH,
  WIDGET_ID,
  WIDGET_SIZE,
  ROOT_ID,
  escapeAttribute,
};
