'use strict';

const http = require('node:http');
const { once } = require('node:events');
const { URL } = require('node:url');

const { CheckoutProcessor, CheckoutError } = require('./checkout-service');

const DEFAULT_PORT = 4300;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_SIZE_BYTES = 512 * 1024;

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
  } catch (_error) {
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

function sendNoContent(res, headers = {}) {
  res.writeHead(204, headers);
  res.end();
}

async function handleOrdersRoute(req, res, url, processor, corsHeaders) {
  if (req.method !== 'POST' || url.pathname !== '/orders') {
    throw new HttpError(404, 'Recurso no encontrado');
  }

  const body = await readJsonBody(req);

  try {
    const result = await processor.processOrder(body);
    sendJson(
      res,
      201,
      {
        orderId: result.orderId,
        customerId: result.customerId,
        paymentId: result.paymentId,
        confirmedAt: result.confirmedAt,
        event: result.eventRecord,
      },
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      sendJson(res, error.status ?? 400, { message: error.message }, corsHeaders);
      return;
    }
    throw error;
  }
}

async function handleRequest(req, res, processor) {
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
    sendJson(res, 200, { status: 'ok' }, corsHeaders);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/orders') {
    await handleOrdersRoute(req, res, url, processor, corsHeaders);
    return;
  }

  throw new HttpError(404, 'Recurso no encontrado');
}

async function startCheckoutService(options = {}) {
  const {
    port = DEFAULT_PORT,
    host = DEFAULT_HOST,
    processor: providedProcessor,
    nosqlUrl,
    eventBusUrl,
    collections,
    eventChannel,
  } = options;

  const processor =
    providedProcessor ||
    new CheckoutProcessor({ nosqlUrl, eventBusUrl, collections, eventChannel });

  await processor.initialize();

  const server = http.createServer((req, res) => {
    Promise.resolve(handleRequest(req, res, processor))
      .catch((error) => {
        const corsHeaders = createCorsHeaders(req);
        if (error instanceof HttpError) {
          if (error.statusCode === 204) {
            sendNoContent(res, corsHeaders);
            return;
          }
          sendJson(res, error.statusCode, { message: error.message }, corsHeaders);
          return;
        }
        if (error instanceof CheckoutError) {
          sendJson(res, error.status ?? 400, { message: error.message }, corsHeaders);
          return;
        }
        console.error('Error inesperado en el servicio de ecommerce', error);
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

  return { server, url, close, processor };
}

module.exports = {
  startCheckoutService,
  HttpError,
};

if (require.main === module) {
  startCheckoutService()
    .then(({ url }) => {
      console.log(`Servicio de checkout disponible en ${url}`); // eslint-disable-line no-console
    })
    .catch((error) => {
      console.error('No se pudo iniciar el servicio de checkout', error); // eslint-disable-line no-console
      process.exitCode = 1;
    });
}
