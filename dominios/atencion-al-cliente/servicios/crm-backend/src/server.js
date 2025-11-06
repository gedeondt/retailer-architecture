'use strict';

const http = require('node:http');
const { once } = require('node:events');

const { CrmSyncProcessor } = require('./crm-sync-processor');
const { CrmEntityService, EntityServiceError } = require('./crm-entity-service');

const DEFAULT_PORT = 4400;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const LOG_PREFIX = '[crm-backend]';

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createCorsHeaders(req) {
  const origin = req.headers?.origin;
  const allowedOrigin = origin && origin !== 'null' ? origin : '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendNoContent(res, headers = {}) {
  res.writeHead(204, headers);
  res.end();
}

async function handleRequest(req, res, processor, entityService) {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    sendNoContent(res, corsHeaders);
    return;
  }

  if (!req.url) {
    throw new HttpError(400, 'Solicitud inválida');
  }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    const stats = processor.getStats();
    sendJson(res, 200, { status: 'ok', stats }, corsHeaders);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/tasks/sync') {
    const result = await processor.syncPendingEvents();
    const status = result.inProgress ? 'in_progress' : 'completed';
    sendJson(res, 200, { status, result }, corsHeaders);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/entities') {
    const items = entityService.listEntities();
    sendJson(
      res,
      200,
      {
        items,
        totalEntities: items.length,
      },
      corsHeaders,
    );
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/entities/')) {
    const segments = url.pathname.split('/').filter(Boolean);
    const entityId = segments[1];

    if (!entityId) {
      throw new HttpError(404, 'Entidad no encontrada');
    }

    const page = url.searchParams.get('page');
    const pageSize = url.searchParams.get('pageSize');

    const result = await entityService.listEntityItems(entityId, { page, pageSize });
    sendJson(res, 200, result, corsHeaders);
    return;
  }

  throw new HttpError(404, 'Recurso no encontrado');
}

async function startCrmService(options = {}) {
  const {
    port = DEFAULT_PORT,
    host = DEFAULT_HOST,
    processor: providedProcessor,
    nosqlUrl,
    eventBusUrl,
    collection,
    eventChannel,
    consumerName,
    batchSize,
    fetchImpl,
    clock,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;

  const processor =
    providedProcessor ||
    new CrmSyncProcessor({
      nosqlUrl,
      eventBusUrl,
      collection,
      eventChannel,
      consumerName,
      batchSize,
      fetchImpl,
      clock,
    });

  await processor.initialize();

  const entityService = new CrmEntityService({
    processor,
    fetchImpl,
    nosqlUrl,
    collectionName: processor.collection?.name,
    customersCollectionName: processor.collections?.customers?.name,
    ordersCollectionName: processor.collections?.orders?.name,
    orderItemsCollectionName: processor.collections?.orderItems?.name,
    orderPaymentsCollectionName: processor.collections?.orderPayments?.name,
  });

  let intervalId = null;
  const scheduleSync = pollIntervalMs !== null && pollIntervalMs !== undefined && pollIntervalMs > 0;

  const runSync = async () => {
    try {
      await processor.syncPendingEvents();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} Error al sincronizar eventos del CRM`, error);
    }
  };

  if (scheduleSync) {
    intervalId = setInterval(runSync, pollIntervalMs);
    if (typeof intervalId.unref === 'function') {
      intervalId.unref();
    }
    runSync();
  }

  const server = http.createServer((req, res) => {
    Promise.resolve(handleRequest(req, res, processor, entityService))
      .catch((error) => {
        const corsHeaders = createCorsHeaders(req);
        if (error instanceof HttpError || error instanceof EntityServiceError) {
          if (error.statusCode === 204) {
            sendNoContent(res, corsHeaders);
            return;
          }
          sendJson(res, error.statusCode, { message: error.message }, corsHeaders);
          return;
        }
        // eslint-disable-next-line no-console
        console.error(`${LOG_PREFIX} Error inesperado en la API`, error);
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
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return { url, close, server, processor, entityService };
}

module.exports = { startCrmService, HttpError };

if (require.main === module) {
  startCrmService()
    .then(({ url }) => {
      // eslint-disable-next-line no-console
      console.log(`${LOG_PREFIX} Servicio CRM disponible en ${url}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} No se pudo iniciar el servicio CRM`, error);
      process.exitCode = 1;
    });
}
