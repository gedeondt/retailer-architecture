'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const { URL } = require('node:url');

const { CollectionStore, CollectionError, parsePagination } = require('./collection-store');
const { renderWidgetShell, WIDGET_CLIENT_PATH } = require('./widget-shell');

const DEFAULT_PORT = 4100;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_SIZE_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readRequestBody(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'Solo se acepta contenido application/json');
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
    throw new HttpError(400, 'El cuerpo no es un JSON válido');
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
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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

function extractCollectionParams(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'collections') {
    return null;
  }
  return segments.slice(1);
}

async function handleRequest(req, res, store, assets, corsHeaders) {
  if (req.method === 'OPTIONS') {
    sendNoContent(res, corsHeaders);
    return;
  }

  if (req.method === 'GET' && req.url) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/widget') {
      const apiOrigin = url.searchParams.get('apiOrigin') || undefined;
      sendText(res, 200, renderWidgetShell({ apiOrigin }), 'text/html; charset=utf-8', corsHeaders);
      return;
    }

    if (url.pathname === WIDGET_CLIENT_PATH) {
      sendText(res, 200, assets.widgetClientScript, 'text/plain; charset=utf-8', corsHeaders);
      return;
    }

    if (url.pathname === '/collections') {
      const summaries = store.getCollectionSummaries();
      const storage = store.getStorageStats();
      sendJson(res, 200, { items: summaries, totalCollections: summaries.length, storage }, corsHeaders);
      return;
    }
  }

  if (req.method === 'POST' && req.url) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/collections') {
      const body = await readRequestBody(req);
      const collection = await store.createCollection(body);
      sendJson(res, 201, collection, corsHeaders);
      return;
    }
  }

  const url = req.url ? new URL(req.url, 'http://localhost') : null;
  if (!url) {
    throw new HttpError(400, 'Solicitud inválida');
  }

  const params = extractCollectionParams(url.pathname);
  if (!params || params.length === 0) {
    throw new HttpError(404, 'Recurso no encontrado');
  }

  const [collectionName, action, maybeId] = params;

  if (req.method === 'POST' && action === 'items' && !maybeId) {
    const body = await readRequestBody(req);
    const result = await store.addItem(collectionName, body);
    sendJson(res, 201, result, corsHeaders);
    return;
  }

  if (req.method === 'GET' && action === 'items' && !maybeId) {
    const { page, pageSize } = parsePagination(url.searchParams.get('page'), url.searchParams.get('pageSize'));
    const result = await store.listItems(collectionName, { page, pageSize });
    sendJson(res, 200, result, corsHeaders);
    return;
  }

  if (req.method === 'GET' && action === 'items' && maybeId) {
    const result = await store.getItem(collectionName, maybeId);
    sendJson(res, 200, result, corsHeaders);
    return;
  }

  if (req.method === 'PUT' && action === 'items' && maybeId) {
    const body = await readRequestBody(req);
    const result = await store.updateItem(collectionName, maybeId, body);
    sendJson(res, 200, result, corsHeaders);
    return;
  }

  if (req.method === 'DELETE' && action === 'items' && maybeId) {
    const result = await store.deleteItem(collectionName, maybeId);
    sendJson(res, 200, result, corsHeaders);
    return;
  }

  if (req.method === 'GET' && action === 'search' && maybeId === undefined) {
    const query = url.searchParams.get('query');
    const { page, pageSize } = parsePagination(url.searchParams.get('page'), url.searchParams.get('pageSize'));
    const result = await store.searchItems(collectionName, query, { page, pageSize });
    sendJson(res, 200, result, corsHeaders);
    return;
  }

  throw new HttpError(404, 'Recurso no encontrado');
}

async function startNosqlService(options = {}) {
  const {
    port = DEFAULT_PORT,
    host = DEFAULT_HOST,
    dataDir = path.join(__dirname, '..', 'data'),
    store = new CollectionStore({ baseDir: path.join(dataDir) }),
    widgetClientPath = path.join(__dirname, 'widget-client.jsx'),
  } = options;

  await store.initialize();

  const widgetClientScript = await fs.readFile(widgetClientPath, 'utf8');

  const server = http.createServer((req, res) => {
    const corsHeaders = createCorsHeaders(req);
    Promise.resolve(handleRequest(req, res, store, { widgetClientScript }, corsHeaders))
      .catch((error) => {
        if (error instanceof HttpError) {
          sendJson(res, error.statusCode, { message: error.message }, corsHeaders);
          return;
        }
        if (error instanceof CollectionError) {
          sendJson(res, error.status, { message: error.message }, corsHeaders);
          return;
        }
        console.error('Error inesperado en la API NoSQL', error);
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

  const close = () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return { server, url, close, store };
}

module.exports = {
  startNosqlService,
  renderWidgetShell,
  HttpError,
};

if (require.main === module) {
  startNosqlService()
    .then(({ url }) => {
      console.log(`Servicio NoSQL disponible en ${url}`);
    })
    .catch((error) => {
      console.error('No se pudo iniciar el servicio NoSQL', error);
      process.exitCode = 1;
    });
}
