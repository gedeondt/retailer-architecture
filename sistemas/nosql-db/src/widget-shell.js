'use strict';

const WIDGET_ID = 'sistemas-nosql-db';
const WIDGET_SIZE = '2';
const WIDGET_CLIENT_PATH = '/widget/client.jsx';

function escapeAttribute(value) {
  return String(value).replace(/"/g, '&quot;');
}

function renderWidgetShell(options = {}) {
  const { apiOrigin } = options;
  const rootAttributes = ['id="nosql-db-root"'];
  if (apiOrigin) {
    rootAttributes.push(`data-api-origin="${escapeAttribute(apiOrigin)}"`);
  }

  return [
    `<section data-widget-id="${WIDGET_ID}" data-widget-size="${WIDGET_SIZE}" class="col-span-2">`,
    '  <div class="bg-slate-800 rounded-xl shadow-lg p-6 text-slate-100 space-y-6">',
    `    <div ${rootAttributes.join(' ')}></div>`,
    '  </div>',
    '</section>',
    `<script type="text/babel" data-presets="react" src="${WIDGET_CLIENT_PATH}"></script>`,
  ].join('\n');
}

module.exports = {
  renderWidgetShell,
  WIDGET_CLIENT_PATH,
  escapeAttribute,
};

