function toAbsoluteUrl(value, base) {
  if (!value) {
    return value;
  }
  if (/^https?:/i.test(value)) {
    return value;
  }
  return new URL(value, base).toString();
}

function parseListAttribute(value) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function executeBabelScript(script) {
  if (typeof window.Babel === 'undefined' || typeof window.Babel.transform !== 'function') {
    throw new Error('Babel no está disponible para transformar el widget.');
  }

  const dataset = script.dataset || {};
  const presets = parseListAttribute(dataset.presets);
  const plugins = parseListAttribute(dataset.plugins);
  const sourceType = dataset.type === 'module' ? 'module' : 'script';
  const filename = dataset.filename || script.getAttribute('src') || 'widget.jsx';

  let sourceCode = script.textContent || '';
  const scriptSrc = script.getAttribute('src');
  if (scriptSrc) {
    const response = await fetch(scriptSrc);
    if (!response.ok) {
      throw new Error(`no se pudo descargar el cliente del widget (${response.status})`);
    }
    sourceCode = await response.text();
  }

  const transformed = window.Babel.transform(sourceCode, {
    presets,
    plugins,
    sourceType,
    filename,
  });

  const runnable = document.createElement('script');
  runnable.type = sourceType === 'module' ? 'module' : 'text/javascript';
  runnable.text = transformed.code;
  script.replaceWith(runnable);
}

function cloneScriptAttributes(source, target, options = {}) {
  const skip = options.skip ? new Set(options.skip) : new Set();
  for (const attr of source.attributes) {
    if (skip.has(attr.name)) {
      continue;
    }
    if (attr.name === 'src') {
      target.src = attr.value;
    } else {
      target.setAttribute(attr.name, attr.value);
    }
  }
}

async function executeExternalScript(script) {
  const runnable = document.createElement('script');
  cloneScriptAttributes(script, runnable);
  await new Promise((resolve, reject) => {
    runnable.addEventListener('load', resolve, { once: true });
    runnable.addEventListener(
      'error',
      () => reject(new Error(`no se pudo cargar el script ${script.src || script.getAttribute('src')}`)),
      { once: true },
    );
    script.replaceWith(runnable);
  });
}

function executeInlineScript(script) {
  const runnable = document.createElement('script');
  cloneScriptAttributes(script, runnable, { skip: ['type'] });
  runnable.type = script.type && script.type !== 'text/babel' ? script.type : 'text/javascript';
  runnable.text = script.textContent || '';
  script.replaceWith(runnable);
}

async function bootstrapScript(script) {
  const type = (script.getAttribute('type') || '').toLowerCase();
  if (type === 'text/babel' || type === 'text/jsx') {
    await executeBabelScript(script);
    return;
  }

  if (script.getAttribute('src')) {
    await executeExternalScript(script);
    return;
  }

  executeInlineScript(script);
}

async function mountWidget(options) {
  const { slotId, systemKey, defaultWidgetOrigin, defaultApiOrigin, errorTitle } = options;
  const slot = document.getElementById(slotId);
  if (!slot) {
    return;
  }

  const launcherConfig = window.__LAUNCHER_CONFIG__ || {};
  const systemsConfig = launcherConfig.systems || {};
  const widgetConfig = (systemKey && systemsConfig[systemKey]) || {};

  const widgetOrigin = widgetConfig.widgetOrigin || slot.dataset.widgetOrigin || defaultWidgetOrigin;
  const apiOrigin = widgetConfig.apiOrigin || slot.dataset.apiOrigin || defaultApiOrigin || widgetOrigin;

  try {
    const widgetUrl = new URL('widget', widgetOrigin);
    if (apiOrigin) {
      widgetUrl.searchParams.set('apiOrigin', apiOrigin);
    }

    const response = await fetch(widgetUrl);
    if (!response.ok) {
      throw new Error(`estado ${response.status}`);
    }

    const html = await response.text();
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const fragment = template.content;

    const scripts = [...fragment.querySelectorAll('script')];
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src) {
        script.setAttribute('src', toAbsoluteUrl(src, widgetOrigin));
      }
    }

    slot.replaceWith(fragment);

    for (const script of scripts) {
      await bootstrapScript(script);
    }
  } catch (error) {
    slot.innerHTML = `
      <article class="bg-white rounded-xl border border-rose-300/60 shadow-sm p-6">
        <h3 class="text-base font-semibold text-rose-600 mb-2">${errorTitle}</h3>
        <p class="text-sm text-rose-500">No se pudo cargar el microfrontend (${error.message}).</p>
      </article>
    `;
  }
}

const dashboardWidgets = {
  toAbsoluteUrl,
  parseListAttribute,
  executeBabelScript,
  cloneScriptAttributes,
  executeExternalScript,
  executeInlineScript,
  bootstrapScript,
  mountWidget,
};

window.dashboardWidgets = dashboardWidgets;

export {
  toAbsoluteUrl,
  parseListAttribute,
  executeBabelScript,
  cloneScriptAttributes,
  executeExternalScript,
  executeInlineScript,
  bootstrapScript,
  mountWidget,
};

export default dashboardWidgets;
