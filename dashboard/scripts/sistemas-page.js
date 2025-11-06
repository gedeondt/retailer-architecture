import dashboardWidgets from './widget-loader.js';

const LOGS_CONTAINER_ID = 'launcher-logs-widget';
const DEFAULT_LOGS_ENDPOINT = '/api/logs';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MIN_POLL_INTERVAL_MS = 1000;

function formatLevelLabel(level) {
  if (typeof level !== 'string') {
    return '—';
  }
  const trimmed = level.trim();
  return trimmed === '' ? '—' : trimmed.toUpperCase();
}

function formatTimeLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildLogsUrl(basePath, level, windowRef) {
  const origin = windowRef?.location?.origin ?? (typeof location !== 'undefined' ? location.origin : 'http://localhost');
  const base = typeof basePath === 'string' && basePath !== '' ? basePath : DEFAULT_LOGS_ENDPOINT;
  try {
    const url = new URL(base, origin || 'http://localhost');
    if (level) {
      url.searchParams.set('level', level);
    }
    return url.toString();
  } catch (_error) {
    if (!level) {
      return base;
    }
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}level=${encodeURIComponent(level)}`;
  }
}

function createLogItem(documentRef, log) {
  const item = documentRef.createElement('li');
  item.className = 'rounded-lg border border-slate-200 bg-slate-50 p-3';

  const meta = documentRef.createElement('div');
  meta.className = 'flex items-center justify-between gap-3';

  const metaLeft = documentRef.createElement('div');
  metaLeft.className = 'flex items-center gap-2';

  const service = documentRef.createElement('span');
  service.className = 'text-xs font-semibold uppercase tracking-wide text-slate-600';
  service.textContent = typeof log.service === 'string' && log.service.trim() !== '' ? log.service : 'launcher';

  const level = documentRef.createElement('span');
  level.className =
    'inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700';
  level.textContent = formatLevelLabel(log.level);

  metaLeft.appendChild(service);
  metaLeft.appendChild(level);

  const time = documentRef.createElement('time');
  time.className = 'text-xs font-mono text-slate-500';
  if (log.timestamp) {
    time.dateTime = log.timestamp;
  }
  time.textContent = formatTimeLabel(log.timestamp);

  meta.appendChild(metaLeft);
  meta.appendChild(time);

  const message = documentRef.createElement('p');
  message.className = 'mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words';
  message.textContent = typeof log.message === 'string' ? log.message : '';

  item.appendChild(meta);
  item.appendChild(message);
  return item;
}

function initLogsViewer(options = {}) {
  const {
    containerId = LOGS_CONTAINER_ID,
    documentRef = typeof document !== 'undefined' ? document : null,
    windowRef = typeof window !== 'undefined' ? window : null,
    fetchImpl = windowRef?.fetch ?? (typeof fetch === 'function' ? fetch : null),
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    logsEndpoint = DEFAULT_LOGS_ENDPOINT,
    scheduler = globalThis,
  } = options;

  if (!documentRef || typeof documentRef.getElementById !== 'function' || typeof documentRef.createElement !== 'function') {
    return { destroy() {} };
  }

  const container = documentRef.getElementById(containerId);
  if (!container) {
    return { destroy() {} };
  }

  const article = documentRef.createElement('article');
  article.className = 'bg-white rounded-xl border border-slate-200 shadow-sm h-full flex flex-col';

  const header = documentRef.createElement('header');
  header.className =
    'px-6 py-4 border-b border-slate-200 flex flex-col gap-3 md:flex-row md:items-center md:justify-between';

  const headerInfo = documentRef.createElement('div');
  headerInfo.className = 'flex flex-col gap-1';

  const title = documentRef.createElement('h3');
  title.className = 'text-base font-semibold text-slate-800';
  title.textContent = 'Logs del launcher';

  const subtitle = documentRef.createElement('p');
  subtitle.className = 'text-xs text-slate-500';
  subtitle.textContent = 'Monitorea los registros generados por los servicios orquestados.';

  headerInfo.appendChild(title);
  headerInfo.appendChild(subtitle);

  const controlsStack = documentRef.createElement('div');
  controlsStack.className = 'flex flex-col gap-2 items-start md:items-end';

  const statusText = documentRef.createElement('span');
  statusText.className = 'text-xs text-slate-400';
  statusText.textContent = 'Cargando logs…';

  const controlsRow = documentRef.createElement('div');
  controlsRow.className = 'flex items-center gap-2';

  const selectLabel = documentRef.createElement('label');
  selectLabel.className = 'text-xs font-medium uppercase tracking-wide text-slate-500';

  const select = documentRef.createElement('select');
  select.className =
    'text-sm rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
  select.disabled = true;
  const selectId = `${containerId}-level-select`;
  select.id = selectId;
  selectLabel.setAttribute('for', selectId);
  selectLabel.htmlFor = selectId;
  selectLabel.textContent = 'Tipo de log';

  controlsRow.appendChild(selectLabel);
  controlsRow.appendChild(select);

  controlsStack.appendChild(statusText);
  controlsStack.appendChild(controlsRow);

  header.appendChild(headerInfo);
  header.appendChild(controlsStack);

  const body = documentRef.createElement('div');
  body.className = 'flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4';

  const placeholder = documentRef.createElement('p');
  placeholder.className = 'text-sm text-slate-500';
  placeholder.textContent = 'Cargando logs…';

  const list = documentRef.createElement('ul');
  list.className = 'space-y-3';
  list.hidden = true;

  body.appendChild(placeholder);
  body.appendChild(list);

  article.appendChild(header);
  article.appendChild(body);

  container.replaceChildren(article);

  const state = {
    level: null,
    levels: [],
    logs: [],
    isLoading: true,
    error: null,
    lastUpdated: null,
  };

  const intervalValue = Number.isInteger(pollIntervalMs) && pollIntervalMs >= MIN_POLL_INTERVAL_MS
    ? pollIntervalMs
    : DEFAULT_POLL_INTERVAL_MS;

  let timerId = null;
  let isFetching = false;
  let queuedLevel = null;

  function updateLevelOptions() {
    const desired = state.levels;
    const current = Array.from(select.children).map((option) => option.value);
    const requiresUpdate =
      desired.length !== current.length || desired.some((value, index) => current[index] !== value);

    if (requiresUpdate) {
      if (desired.length === 0) {
        select.replaceChildren();
      } else {
        const optionNodes = desired.map((level) => {
          const option = documentRef.createElement('option');
          option.value = level;
          option.textContent = formatLevelLabel(level);
          if (state.level === level) {
            option.selected = true;
          }
          return option;
        });
        select.replaceChildren(...optionNodes);
      }
    } else {
      for (const option of select.children) {
        option.selected = option.value === state.level;
      }
    }
  }

  function render() {
    updateLevelOptions();

    if (state.level && state.levels.includes(state.level)) {
      select.value = state.level;
    } else if (state.levels.length > 0) {
      select.value = state.levels[0];
    } else {
      select.value = '';
    }

    select.disabled = state.levels.length === 0;

    if (state.error) {
      statusText.textContent = state.logs.length > 0
        ? 'Error al actualizar. Mostrando registros anteriores.'
        : 'Error al actualizar.';
    } else if (state.isLoading) {
      statusText.textContent = 'Actualizando…';
    } else if (state.lastUpdated) {
      statusText.textContent = `Actualizado a las ${formatTimeLabel(state.lastUpdated)}`;
    } else {
      statusText.textContent = 'Sin datos';
    }

    if (state.logs.length === 0) {
      list.hidden = true;
      list.replaceChildren();
      placeholder.hidden = false;
      placeholder.textContent = state.error
        ? 'No se pudieron cargar los logs.'
        : state.isLoading
          ? 'Cargando logs…'
          : 'No hay registros para este nivel.';
    } else {
      list.hidden = false;
      const items = state.logs.map((entry) => createLogItem(documentRef, entry));
      list.replaceChildren(...items);
      if (state.error) {
        placeholder.hidden = false;
        placeholder.textContent = 'Error al actualizar. Mostrando registros anteriores.';
      } else {
        placeholder.hidden = true;
      }
    }
  }

  async function loadLogs(levelOverride) {
    const normalizedLevel = typeof levelOverride === 'string' && levelOverride.trim() !== ''
      ? levelOverride.trim()
      : undefined;

    if (isFetching) {
      if (normalizedLevel) {
        queuedLevel = normalizedLevel;
      }
      return;
    }

    const levelToRequest = normalizedLevel ?? state.level ?? undefined;

    if (normalizedLevel) {
      state.level = normalizedLevel;
    }

    state.isLoading = true;
    render();

    if (typeof fetchImpl !== 'function') {
      state.error = 'No se pudieron cargar los logs.';
      state.isLoading = false;
      render();
      return;
    }

    isFetching = true;
    try {
      const targetUrl = buildLogsUrl(logsEndpoint, levelToRequest, windowRef);
      const response = await fetchImpl(targetUrl, { headers: { accept: 'application/json' } });
      if (!response || response.ok === false) {
        throw new Error('Respuesta inválida');
      }
      const payload = await response.json();
      const availableLevels = Array.isArray(payload?.levels)
        ? payload.levels.filter((value) => typeof value === 'string' && value.trim() !== '')
        : [];

      state.levels = availableLevels;

      let resolvedLevel = levelToRequest;
      if (!resolvedLevel || !availableLevels.includes(resolvedLevel)) {
        resolvedLevel = availableLevels[0] ?? null;
      }
      state.level = resolvedLevel;

      const rawItems = Array.isArray(payload?.items) ? payload.items : [];
      const filteredItems = resolvedLevel
        ? rawItems.filter((entry) => entry && entry.level === resolvedLevel)
        : rawItems;

      state.logs = filteredItems.map((entry) => ({
        service: typeof entry?.service === 'string' ? entry.service : 'launcher',
        level: typeof entry?.level === 'string' ? entry.level : resolvedLevel ?? '',
        message: typeof entry?.message === 'string' ? entry.message : '',
        timestamp: typeof entry?.timestamp === 'string' ? entry.timestamp : entry?.timestamp ?? '',
      }));
      state.error = null;
      state.lastUpdated = new Date();
    } catch (_error) {
      state.error = 'No se pudieron cargar los logs.';
    } finally {
      state.isLoading = false;
      isFetching = false;
      render();
      if (queuedLevel) {
        const pending = queuedLevel;
        queuedLevel = null;
        loadLogs(pending);
      }
    }
  }

  function handleLevelChange(event) {
    const selectedValue = typeof event?.target?.value === 'string' ? event.target.value : '';
    const normalized = selectedValue.trim();
    state.level = normalized === '' ? null : normalized;
    state.logs = [];
    state.error = null;
    state.isLoading = true;
    render();
    if (state.level) {
      loadLogs(state.level);
    } else {
      loadLogs();
    }
  }

  select.addEventListener('change', handleLevelChange);

  render();
  loadLogs();

  if (scheduler && typeof scheduler.setInterval === 'function') {
    timerId = scheduler.setInterval(() => {
      if (state.level) {
        loadLogs(state.level);
      } else {
        loadLogs();
      }
    }, intervalValue);
  }

  return {
    destroy() {
      select.removeEventListener('change', handleLevelChange);
      if (timerId !== null && scheduler && typeof scheduler.clearInterval === 'function') {
        scheduler.clearInterval(timerId);
      }
    },
  };
}

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

  initLogsViewer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSistemasWidgets, { once: true });
} else {
  initSistemasWidgets();
}

export { initLogsViewer, initSistemasWidgets, buildLogsUrl };
