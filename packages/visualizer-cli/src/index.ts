import process from 'node:process';
import { createInterface } from 'node:readline/promises';

type UiMode = 'visualizer' | 'scenario-menu';

interface ScenarioDomainServiceDescriptor {
  id?: string;
  name?: string;
  displayName?: string;
  description?: string;
}

interface ScenarioDomainDescriptor {
  id?: string;
  name?: string;
  displayName?: string;
  services?: ScenarioDomainServiceDescriptor[];
}

interface ScenarioDescriptor {
  name: string;
  displayName?: string;
  description?: string;
  domains?: ScenarioDomainDescriptor[];
}

interface ScenarioListItem {
  name: string;
  displayName?: string;
  description?: string;
}

interface VisualizerEvent {
  id?: string;
  traceId?: string;
  domain?: string;
  service?: string;
  name?: string;
  message?: string;
  timestamp?: number | string;
  [key: string]: unknown;
}

interface DomainColumn {
  id: string;
  title: string;
  services: string[];
}

interface VisualizerState {
  scenario: ScenarioDescriptor | null;
  columns: DomainColumn[];
  eventLog: VisualizerEvent[];
  systemMessage: string | null;
}

interface TraceRow {
  traceId: string;
  valuesByDomain: Map<string, string>;
  lastUpdatedAt: number;
}

const API_BASE_URL = (process.env.VISUALIZER_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const POLL_INTERVAL_MS = Number.parseInt(process.env.VISUALIZER_POLL_INTERVAL ?? '500', 10);
const MAX_EVENT_LOG_SIZE = 200;
const MAX_TRACE_ROWS = 15;

let uiMode: UiMode = 'visualizer';
let isRunning = true;
let isSwitching = false;
let isShuttingDown = false;
let pollLoopPromise: Promise<void> | null = null;

const visualizerState: VisualizerState = {
  scenario: null,
  columns: [],
  eventLog: [],
  systemMessage: null,
};

process.stdin.setEncoding('utf8');
process.on('SIGINT', () => {
  void shutdown();
});

function buildURL(path: string): string {
  if (!path.startsWith('/')) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTimestamp(input?: number | string): string {
  if (input === undefined) {
    return '';
  }
  if (typeof input === 'string') {
    const parsed = Number.parseInt(input, 10);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return input;
  }
  if (!Number.isFinite(input)) {
    return '';
  }
  try {
    return new Date(input).toISOString();
  } catch (error) {
    return '';
  }
}

function resolveScenarioTitle(scenario: ScenarioDescriptor | ScenarioListItem | null): string {
  if (!scenario) {
    return 'Ningún escenario activo';
  }
  return scenario.displayName ?? scenario.name;
}

function buildDomainColumns(scenario: ScenarioDescriptor | null): DomainColumn[] {
  if (!scenario?.domains || !Array.isArray(scenario.domains)) {
    return [];
  }

  return scenario.domains.map((domain, index) => {
    const columnId = domain.id ?? domain.name ?? `domain-${index + 1}`;
    const title = domain.displayName ?? domain.name ?? domain.id ?? `Dominio ${index + 1}`;
    const services = Array.isArray(domain.services)
      ? domain.services
          .map((service, serviceIndex) =>
            service.displayName ?? service.name ?? service.id ?? `Servicio ${serviceIndex + 1}`,
          )
          .filter((value) => value.trim().length > 0)
      : [];

    return {
      id: columnId,
      title,
      services,
    } satisfies DomainColumn;
  });
}

function applyEvents(events: VisualizerEvent[]): void {
  if (events.length === 0) {
    return;
  }
  visualizerState.systemMessage = null;

  for (const event of events) {
    visualizerState.eventLog.push(event);
  }

  while (visualizerState.eventLog.length > MAX_EVENT_LOG_SIZE) {
    visualizerState.eventLog.shift();
  }
}

function buildTraceRows(state: VisualizerState): TraceRow[] {
  const traceIdsInOrder: string[] = [];
  const traceMap = new Map<string, TraceRow>();

  for (const event of state.eventLog) {
    const traceId = event.traceId ?? '—';
    let row = traceMap.get(traceId);

    if (!row) {
      row = {
        traceId,
        valuesByDomain: new Map<string, string>(),
        lastUpdatedAt: Date.now(),
      } satisfies TraceRow;
      traceMap.set(traceId, row);
      traceIdsInOrder.push(traceId);
    }

    const domainKey = event.domain ?? '—';
    const value = event.name ?? event.message ?? '';

    if (value.trim().length > 0) {
      row.valuesByDomain.set(domainKey, value);
    }

    const timestamp = typeof event.timestamp === 'string' ? Number.parseInt(event.timestamp, 10) : event.timestamp;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      row.lastUpdatedAt = timestamp;
    } else {
      row.lastUpdatedAt = Date.now();
    }
  }

  const rows = traceIdsInOrder
    .map((traceId) => traceMap.get(traceId)!)
    .filter(Boolean)
    .sort((a, b) => a.lastUpdatedAt - b.lastUpdatedAt);

  if (rows.length <= MAX_TRACE_ROWS) {
    return rows;
  }

  return rows.slice(rows.length - MAX_TRACE_ROWS);
}

function renderLayout(state: VisualizerState, options: { systemMessage?: string } = {}): void {
  const width = process.stdout.columns ?? 120;
  const separator = '-'.repeat(Math.max(10, Math.min(width, 120)));
  const scenarioTitle = resolveScenarioTitle(state.scenario);

  console.log(`Escenario activo: ${scenarioTitle}`);
  console.log(separator);

  if (state.columns.length === 0) {
    console.log('No hay dominios registrados.');
  } else {
    for (const column of state.columns) {
      console.log(`• ${column.title}`);
      if (column.services.length === 0) {
        console.log('  (sin servicios)');
        continue;
      }
      for (const service of column.services) {
        console.log(`  - ${service}`);
      }
    }
  }

  console.log(separator);
  console.log('Trazas recientes:');

  const rows = buildTraceRows(state);
  const domainOrder = state.columns.map((column) => column.id);

  if (rows.length === 0) {
    console.log('(sin trazas)');
  } else {
    const headerCells = ['TraceId', ...state.columns.map((column) => column.title)];
    console.log(headerCells.join(' | '));
    console.log('-'.repeat(Math.min(width, 120)));

    for (const row of rows) {
      const cells = [row.traceId];
      for (const domainId of domainOrder) {
        cells.push(row.valuesByDomain.get(domainId) ?? '');
      }
      console.log(cells.join(' | '));
    }
  }

  console.log(separator);
  console.log('Eventos recientes:');

  if (state.eventLog.length === 0) {
    console.log('(sin eventos)');
  } else {
    const startIndex = Math.max(0, state.eventLog.length - 15);
    for (let index = startIndex; index < state.eventLog.length; index += 1) {
      const event = state.eventLog[index];
      const timestamp = formatTimestamp(event.timestamp);
      const traceId = event.traceId ?? '—';
      const domain = event.domain ?? '—';
      const service = event.service ?? '—';
      const name = event.name ?? event.message ?? '';
      console.log(`[${timestamp}] ${traceId} | ${domain} | ${service} | ${name}`);
    }
  }

  const message = options.systemMessage ?? state.systemMessage;
  if (message) {
    console.log(separator);
    console.log(`⚠️  ${message}`);
  }
}

function renderSystemMessage(state: VisualizerState, message: string): void {
  state.systemMessage = message;
  if (uiMode !== 'visualizer') {
    return;
  }
  console.clear();
  renderLayout(state, { systemMessage: message });
}

function resetStateWithScenario(scenario: ScenarioDescriptor): void {
  visualizerState.scenario = scenario;
  visualizerState.columns = buildDomainColumns(scenario);
  visualizerState.eventLog = [];
  visualizerState.systemMessage = null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildURL(path), {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 204) {
    return [] as unknown as T;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed with status ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function fetchEvents(): Promise<VisualizerEvent[]> {
  try {
    const result = await fetchJson<unknown>("/queues/visualizer/pop");
    if (Array.isArray(result)) {
      return result as VisualizerEvent[];
    }
    if (result && typeof result === 'object' && Array.isArray((result as { events?: unknown }).events)) {
      return ((result as { events: VisualizerEvent[] }).events ?? []) as VisualizerEvent[];
    }
    return [];
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

async function fetchScenarios(): Promise<ScenarioListItem[]> {
  const data = await fetchJson<unknown>('/scenarios', { method: 'GET' });
  if (!Array.isArray(data)) {
    throw new Error('La respuesta de /scenarios no es una lista.');
  }
  return data as ScenarioListItem[];
}

async function fetchCurrentScenario(): Promise<ScenarioDescriptor | null> {
  try {
    const scenario = await fetchJson<ScenarioDescriptor>('/scenario', { method: 'GET' });
    if (!scenario || typeof scenario !== 'object') {
      return null;
    }
    return scenario;
  } catch (error) {
    return null;
  }
}

async function postScenario(name: string): Promise<void> {
  await fetchJson<unknown>('/scenario', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

async function postAdminReset(): Promise<void> {
  try {
    await fetchJson<unknown>('/admin/reset', { method: 'POST', body: JSON.stringify({}) });
  } catch (error) {
    console.warn('No se pudo reiniciar el estado del sistema antes de activar el escenario.');
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

async function pollEventsLoop(): Promise<void> {
  while (isRunning) {
    if (uiMode !== 'visualizer') {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    try {
      const events = await fetchEvents();

      if (uiMode !== 'visualizer') {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (events.length > 0) {
        applyEvents(events);
        console.clear();
        renderLayout(visualizerState);
      }
    } catch (error) {
      if (uiMode === 'visualizer') {
        const message = error instanceof Error ? error.message : String(error);
        renderSystemMessage(visualizerState, `Error al obtener eventos: ${message}`);
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function removeOnKeyListener(): void {
  process.stdin.removeListener('data', onKey);
}

function addOnKeyListener(): void {
  process.stdin.removeListener('data', onKey);
  process.stdin.on('data', onKey);
}

async function shutdown(): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  isRunning = false;

  if (pollLoopPromise) {
    try {
      await pollLoopPromise;
    } catch (error) {
      // Ignored: shutting down.
    }
  }

  removeOnKeyListener();
  process.stdin.pause();
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch (error) {
      // Ignore errors when toggling raw mode during shutdown.
    }
  }

  console.clear();
  process.exit(0);
}

function onKey(chunk: Buffer): void {
  if (uiMode !== 'visualizer') {
    return;
  }

  const key = chunk.toString('utf8');

  if (key === 'q' || key === '\u0003') {
    void shutdown();
    return;
  }

  if (key === 's') {
    void switchScenarioInteractive();
  }
}

async function readLineOnce(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('> ');
    return answer;
  } finally {
    rl.close();
  }
}

async function readNumberOrEmpty(): Promise<number | null> {
  const line = (await readLineOnce()).trim();
  if (line === '') {
    return null;
  }
  const parsed = Number.parseInt(line, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed - 1;
}

async function waitForEnter(): Promise<void> {
  await readLineOnce();
}

async function switchScenarioInteractive(): Promise<void> {
  if (uiMode !== 'visualizer' || isSwitching) {
    return;
  }

  uiMode = 'scenario-menu';
  isSwitching = true;

  removeOnKeyListener();
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch (error) {
      // Ignore errors toggling raw mode when entering scenario menu.
    }
  }
  process.stdin.resume();

  let renderedFromTry = false;

  try {
    console.clear();
    console.log('=== Cambiar de escenario ===');
    console.log('');

    const scenarios = await fetchScenarios();

    if (scenarios.length === 0) {
      console.log('No hay escenarios disponibles.');
      console.log('\nPulsa Enter para volver al visualizador.');
      await waitForEnter();
      return;
    }

    scenarios.forEach((scenario, index) => {
      const title = resolveScenarioTitle(scenario);
      console.log(`${index + 1}. ${title}`);
      if (scenario.description) {
        console.log(`   ${scenario.description}`);
      }
    });

    console.log('\nIntroduce el número del escenario que deseas activar. Pulsa Enter para cancelar.');
    const selection = await readNumberOrEmpty();

    if (selection === null) {
      return;
    }

    if (selection < 0 || selection >= scenarios.length) {
      console.log('\nSelección inválida. Pulsa Enter para continuar.');
      await waitForEnter();
      return;
    }

    const chosenScenario = scenarios[selection];
    console.log(`\nActivando escenario: ${resolveScenarioTitle(chosenScenario)}\n`);

    await postAdminReset();

    try {
      await postScenario(chosenScenario.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`No se pudo activar el escenario: ${message}`);
      console.log('\nPulsa Enter para continuar.');
      await waitForEnter();
      return;
    }

    const currentScenario = await fetchCurrentScenario();
    if (!currentScenario) {
      console.log('No se pudo recuperar el escenario activo después de cambiarlo.');
      console.log('\nPulsa Enter para continuar.');
      await waitForEnter();
      return;
    }

    resetStateWithScenario(currentScenario);
    console.clear();
    uiMode = 'visualizer';
    renderLayout(visualizerState);
    renderedFromTry = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Ocurrió un error al cambiar de escenario: ${message}`);
    console.log('\nPulsa Enter para continuar.');
    await waitForEnter();
    uiMode = 'visualizer';
  } finally {
    const shuttingDown = isShuttingDown;
    isSwitching = false;

    if (shuttingDown) {
      return;
    }

    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch (error) {
        // Ignore errors when toggling raw mode after scenario switch.
      }
    }
    process.stdin.resume();
    addOnKeyListener();

    if (uiMode === 'scenario-menu') {
      uiMode = 'visualizer';
    }

    if (uiMode === 'visualizer' && !renderedFromTry) {
      console.clear();
      renderLayout(visualizerState);
    }
  }
}

async function initialize(): Promise<void> {
  const currentScenario = await fetchCurrentScenario();
  if (currentScenario) {
    resetStateWithScenario(currentScenario);
  }

  console.clear();
  renderLayout(visualizerState);
}

async function main(): Promise<void> {
  await initialize();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  addOnKeyListener();

  pollLoopPromise = pollEventsLoop();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

