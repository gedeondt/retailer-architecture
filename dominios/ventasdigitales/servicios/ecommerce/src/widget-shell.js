'use strict';

const WIDGET_ID = 'ventasdigitales-ecommerce';
const WIDGET_SIZE = '2';
const WIDGET_CLIENT_PATH = '/widgets/ventasdigitales/ecommerce/widget-client.jsx';
const ROOT_ID = 'ventasdigitales-ecommerce-root';

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
    '  <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-6 h-full">',
    '    <div class="h-full flex flex-col" style="min-height: 520px;">',
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
