'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const { URL } = require('node:url');

const { SimpleEventLog } = require('./event-log');
const { renderWidgetShell, WIDGET_CLIENT_PATH } = require('./widget-shell');

const DEFAULT_PORT = 4200;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_SIZE_BYTES = 512 * 1024;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parsePositiveInteger(value, { allowZero = true, paramName }) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, `${paramName} debe ser un número entero`);
  }

  if (parsed < 0 || (!allowZero && parsed === 0)) {
    throw new HttpError(400, `${paramName} debe ser un número entero positivo`);
  }

  return parsed;
}

async function readJsonBody(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'El cuerpo de la petición debe ser application/json');
  }

  const chunks = [];
  let totalLength = 0;

  for await (const chunk of req) {
    totalLength += chunk.length;
    if (totalLength > MAX_BODY_SIZE_BYTES) {
      throw new HttpError(413, 'El cuerpo de la petición supera el límite permitido');
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new HttpError(400, 'No fue posible interpretar el JSON enviado');
  }
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

function sendNoContent(res, headers = {}) {
  res.writeHead(204, headers);
  res.end();
}

function createCorsHeaders(req) {
  const origin = req.headers?.origin;
  const allowedOrigin = origin && origin !== 'null' ? origin : '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (origin && origin !== 'null') {
    headers.Vary = 'Origin';
  }

  const requestedHeaders = req.headers?.['access-control-request-headers'];
  if (requestedHeaders) {
    headers['Access-Control-Allow-Headers'] = requestedHeaders;
  }

  return headers;
}

function decodeConsumerSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    throw new HttpError(400, 'El nombre del consumidor contiene caracteres inválidos');
  }
}

async function buildOverview(log) {
  const events = await log.listEvents();
  const consumers = await log.listConsumers();
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const highWatermark = lastEvent ? lastEvent.id : 0;
  const recentEvents = events.slice(-10).reverse();

  const consumerSummaries = consumers.map((consumer) => ({
    ...consumer,
    pendingEvents: Math.max(0, highWatermark - consumer.offset),
  }));

  return {
    totalEvents: events.length,
    highWatermark,
    lastEvent,
    recentEvents,
    consumers: consumerSummaries,
  };
}

async function ensureConsumer(log, name) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new HttpError(400, 'El nombre del consumidor es obligatorio');
  }
  return log.createConsumer(trimmed);
}

async function handleEventsRoute(req, res, url, log, corsHeaders) {
  if (req.method === 'GET') {
    const since = parsePositiveInteger(url.searchParams.get('since'), { paramName: 'since' });
    const limit = parsePositiveInteger(url.searchParams.get('limit'), {
      paramName: 'limit',
      allowZero: false,
    });

    const events = since !== null ? await log.getEventsSince(since) : await log.listEvents();
    const sliced = limit !== null ? events.slice(0, limit) : events;
    sendJson(res, 200, { items: sliced }, corsHeaders);
    return;
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const record = await log.append({ type: body.type ?? null, payload: body.payload ?? null });
    sendJson(res, 201, record, corsHeaders);
    return;
  }

  if (req.method === 'DELETE') {
    await log.reset();
    sendNoContent(res, corsHeaders);
    return;
  }

  throw new HttpError(405, 'Método no permitido en /events');
}

async function handleConsumersRoute(req, res, url, log, corsHeaders) {
  if (req.method === 'GET' && url.pathname === '/consumers') {
    const consumers = await log.listConsumers();
    sendJson(res, 200, { items: consumers }, corsHeaders);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/consumers') {
    const body = await readJsonBody(req);
    if (!body.name || typeof body.name !== 'string') {
      throw new HttpError(400, 'El nombre del consumidor es obligatorio');
    }

    const consumer = await ensureConsumer(log, body.name);
    const offset = await consumer.getOffset();
    sendJson(res, 201, { name: consumer.name, offset }, corsHeaders);
    return;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'consumers') {
    throw new HttpError(404, 'Consumidor no encontrado');
  }

  const name = decodeConsumerSegment(segments[1]);
  const consumer = await ensureConsumer(log, name);

  if (segments.length === 3 && segments[2] === 'poll') {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Método no permitido en /consumers/:name/poll');
    }

    const body = await readJsonBody(req);
    const limit = body.limit === undefined ? undefined : parsePositiveInteger(body.limit, {
      paramName: 'limit',
      allowZero: false,
    });

    const autoCommit = body.autoCommit === undefined ? true : Boolean(body.autoCommit);

    const batch = await consumer.poll({
      limit: limit === undefined ? Infinity : limit,
      autoCommit,
    });
    const offset = await consumer.getOffset();
    sendJson(
      res,
      200,
      {
        name: consumer.name,
        items: batch,
        committedOffset: offset,
        lastDeliveredEventId: batch.length > 0 ? batch[batch.length - 1].id : null,
      },
      corsHeaders
    );
    return;
  }

  if (segments.length === 3 && segments[2] === 'commit') {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Método no permitido en /consumers/:name/commit');
    }

    const body = await readJsonBody(req);
    const value = parsePositiveInteger(body.lastEventId, {
      paramName: 'lastEventId',
      allowZero: true,
    });
    if (value === null) {
      throw new HttpError(400, 'lastEventId es obligatorio');
    }

    await consumer.commit(value);
    const offset = await consumer.getOffset();
    sendJson(res, 200, { name: consumer.name, offset }, corsHeaders);
    return;
  }

  if (segments.length === 3 && segments[2] === 'reset') {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Método no permitido en /consumers/:name/reset');
    }

    await consumer.reset();
    sendJson(res, 200, { name: consumer.name, offset: 0 }, corsHeaders);
    return;
  }

  throw new HttpError(404, 'Ruta de consumidor no encontrada');
}

async function handleRequest(req, res, context) {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    sendNoContent(res, corsHeaders);
    return;
  }

  if (!req.url) {
    throw new HttpError(400, 'Solicitud inválida');
  }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/widget') {
    const apiOrigin = url.searchParams.get('apiOrigin') || undefined;
    sendText(res, 200, renderWidgetShell({ apiOrigin }), 'text/html; charset=utf-8', corsHeaders);
    return;
  }

  if (req.method === 'GET' && url.pathname === WIDGET_CLIENT_PATH) {
    sendText(res, 200, context.widgetClientScript, 'text/plain; charset=utf-8', {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    });
    return;
  }

  if (url.pathname === '/events') {
    await handleEventsRoute(req, res, url, context.log, corsHeaders);
    return;
  }

  if (url.pathname === '/consumers' || url.pathname.startsWith('/consumers/')) {
    await handleConsumersRoute(req, res, url, context.log, corsHeaders);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/overview') {
    const overview = await buildOverview(context.log);
    sendJson(res, 200, overview, corsHeaders);
    return;
  }

  throw new HttpError(404, 'Recurso no encontrado');
}

async function startEventBusService(options = {}) {
  const {
    port = DEFAULT_PORT,
    host = DEFAULT_HOST,
    dataDir = path.join(__dirname, '..', 'data'),
    resetOnStart = true,
    widgetClientPath = path.join(__dirname, 'widget-client.jsx'),
  } = options;

  const log = new SimpleEventLog({ dataDir });
  if (resetOnStart) {
    await log.reset();
  }

  const widgetClientScript = await fs.readFile(widgetClientPath, 'utf8');

  const server = http.createServer((req, res) => {
    Promise.resolve(handleRequest(req, res, { log, widgetClientScript }))
      .catch((error) => {
        if (error instanceof HttpError) {
          const corsHeaders = createCorsHeaders(req);
          if (error.statusCode === 204) {
            sendNoContent(res, corsHeaders);
            return;
          }
          sendJson(res, error.statusCode, { message: error.message }, corsHeaders);
          return;
        }

        console.error('Error inesperado en la API del event bus', error);
        const corsHeaders = createCorsHeaders(req);
        sendJson(res, 500, { message: 'Error interno del servidor' }, corsHeaders);
      })
      .finally(() => {
        if (!res.writableEnded) {
          res.end();
        }
      });
  });

  server.listen(port, host);
  await once(server, 'listening');

  const address = server.address();
  const resolvedHost = address.address === '::' ? 'localhost' : address.address;
  const url = `http://${resolvedHost}:${address.port}`;

  const close = async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    if (resetOnStart) {
      await log.reset();
    }
  };

  return { server, url, log, close };
}

module.exports = {
  startEventBusService,
  HttpError,
  handleRequest,
  buildOverview,
};

if (require.main === module) {
  startEventBusService()
    .then(({ url }) => {
      console.log(`Servicio Event Bus disponible en ${url}`);
    })
    .catch((error) => {
      console.error('No se pudo iniciar el servicio Event Bus', error);
      process.exitCode = 1;
    });
}
