'use strict';

const WIDGET_ID = 'sistemas-nosql-db';
const WIDGET_SIZE = '2';
const WIDGET_CLIENT_PATH = '/widget/client.jsx';
const REACT_CDN = 'https://unpkg.com/react@18/umd/react.development.js';
const REACT_DOM_CDN = 'https://unpkg.com/react-dom@18/umd/react-dom.development.js';
const BABEL_CDN = 'https://unpkg.com/@babel/standalone@7/babel.min.js';

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
    `<section data-widget-id="${WIDGET_ID}" data-widget-size="${WIDGET_SIZE}" class="p-6">`,
    '  <div class="bg-slate-800 rounded-xl shadow-lg p-6 text-slate-100">',
    `    <div ${rootAttributes.join(' ')}></div>`,
    '  </div>',
    '</section>',
    `<script src="${REACT_CDN}" crossorigin="anonymous"></script>`,
    `<script src="${REACT_DOM_CDN}" crossorigin="anonymous"></script>`,
    `<script src="${BABEL_CDN}" crossorigin="anonymous"></script>`,
    `<script type="text/babel" data-presets="react" src="${WIDGET_CLIENT_PATH}"></script>`,
  ].join('\n');
}

module.exports = {
  renderWidgetShell,
  WIDGET_CLIENT_PATH,
  REACT_CDN,
  REACT_DOM_CDN,
  BABEL_CDN,
  escapeAttribute,
};

