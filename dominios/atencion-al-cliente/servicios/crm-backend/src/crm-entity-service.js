'use strict';

const { URL } = require('node:url');

class EntityServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ENTITY_DEFINITIONS = [
  {
    id: 'crm-customers',
    name: 'Clientes CRM',
    description: 'Clientes consolidados con su último pedido registrado por el CRM.',
    fields: [
      { key: 'customerId', label: 'ID Cliente' },
      { key: 'fullName', label: 'Nombre completo' },
      { key: 'email', label: 'Email' },
      { key: 'lastOrderStatus', label: 'Estado último pedido' },
    ],
  },
  {
    id: 'crm-orders',
    name: 'Pedidos recientes',
    description: 'Pedidos sincronizados desde Ventas Digitales asociados a los clientes del CRM.',
    fields: [
      { key: 'orderId', label: 'ID Pedido' },
      { key: 'customerId', label: 'ID Cliente' },
      { key: 'status', label: 'Estado' },
      { key: 'confirmedAt', label: 'Confirmado el' },
    ],
  },
];

const DEFAULT_PAGE_SIZE = 10;

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('Se requiere una implementación de fetch para CrmEntityService');
}

function safeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

async function parseErrorMessage(response, fallbackMessage) {
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') {
      return body.message;
    }
  } catch (_error) {
    // Ignorar errores al intentar parsear el cuerpo
  }
  return fallbackMessage;
}

function mapCustomerRecord(record) {
  const value = record?.value || {};
  const firstName = safeString(value.firstName);
  const lastName = safeString(value.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    id: record?.id ?? null,
    customerId: safeString(value.customerId),
    fullName: fullName.length > 0 ? fullName : null,
    email: safeString(value.email),
    lastOrderStatus: safeString(value.lastOrderStatus) || safeString(value.lastOrder?.status),
  };
}

function mapOrderRecords(records) {
  const orders = [];

  for (const record of records) {
    const value = record?.value || {};
    const customerId = safeString(value.customerId);
    const items = Array.isArray(value.orders) ? value.orders : [];

    for (const order of items) {
      orders.push({
        id: `${customerId || 'cliente'}-${safeString(order.orderId) || order.id || orders.length}`,
        orderId: safeString(order.orderId) || safeString(order.id),
        customerId,
        status: safeString(order.status),
        confirmedAt: safeString(order.confirmedAt),
      });
    }
  }

  orders.sort((a, b) => {
    const aDate = a.confirmedAt || '';
    const bDate = b.confirmedAt || '';
    return bDate.localeCompare(aDate);
  });

  return orders;
}

class CrmEntityService {
  constructor(options = {}) {
    const {
      processor,
      fetchImpl,
      nosqlUrl = processor?.nosqlUrl ?? 'http://127.0.0.1:4100',
      collectionName = processor?.collection?.name ?? 'crm-customers',
      defaultPageSize = DEFAULT_PAGE_SIZE,
    } = options;

    const resolvedFetch = processor?.fetch || fetchImpl;
    this.fetch = ensureFetch(resolvedFetch);
    this.nosqlUrl = nosqlUrl;
    this.collectionName = collectionName;
    this.defaultPageSize = parsePositiveInteger(defaultPageSize, DEFAULT_PAGE_SIZE);
  }

  listEntities() {
    return ENTITY_DEFINITIONS.map((entity) => ({ ...entity }));
  }

  getEntityDefinition(entityId) {
    return ENTITY_DEFINITIONS.find((entity) => entity.id === entityId) || null;
  }

  async listEntityItems(entityId, options = {}) {
    const definition = this.getEntityDefinition(entityId);
    if (!definition) {
      throw new EntityServiceError(404, `Entidad ${entityId} no encontrada`);
    }

    switch (entityId) {
      case 'crm-customers':
        return { entity: definition, ...(await this.listCustomers(options)) };
      case 'crm-orders':
        return { entity: definition, ...(await this.listOrders(options)) };
      default:
        throw new EntityServiceError(404, `Entidad ${entityId} no encontrada`);
    }
  }

  async listCustomers(options = {}) {
    const page = parsePositiveInteger(options.page, 1);
    const pageSize = parsePositiveInteger(options.pageSize, this.defaultPageSize);

    const url = new URL(`/collections/${this.collectionName}/items`, this.nosqlUrl);
    url.searchParams.set('page', page);
    url.searchParams.set('pageSize', pageSize);

    const response = await this.fetch(url);
    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudieron obtener los clientes del CRM');
      throw new EntityServiceError(response.status, message);
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const mapped = items.map((record) => mapCustomerRecord(record));

    return {
      page: payload?.page ?? page,
      pageSize: payload?.pageSize ?? pageSize,
      totalItems: payload?.totalItems ?? mapped.length,
      totalPages: payload?.totalPages ?? (mapped.length === 0 ? 0 : 1),
      items: mapped,
    };
  }

  async listOrders(options = {}) {
    const page = parsePositiveInteger(options.page, 1);
    const pageSize = parsePositiveInteger(options.pageSize, this.defaultPageSize);

    const records = await this.fetchAllCustomerRecords();
    const orders = mapOrderRecords(records);

    const totalItems = orders.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const currentPage = Math.min(page, totalPages === 0 ? 1 : totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const paged = orders.slice(startIndex, startIndex + pageSize);

    return {
      page: currentPage,
      pageSize,
      totalItems,
      totalPages,
      items: paged,
    };
  }

  async fetchAllCustomerRecords() {
    const records = [];
    let page = 1;
    const pageSize = 50;

    while (true) {
      const url = new URL(`/collections/${this.collectionName}/items`, this.nosqlUrl);
      url.searchParams.set('page', page);
      url.searchParams.set('pageSize', pageSize);

      const response = await this.fetch(url);
      if (response.status !== 200) {
        const message = await parseErrorMessage(response, 'No se pudieron obtener los clientes del CRM');
        throw new EntityServiceError(response.status, message);
      }

      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      records.push(...items);

      const totalPages = payload?.totalPages;
      if (typeof totalPages === 'number' && totalPages >= page) {
        if (page >= totalPages) {
          break;
        }
      } else if (items.length < pageSize) {
        break;
      }

      page += 1;
    }

    return records;
  }
}

module.exports = {
  CrmEntityService,
  EntityServiceError,
  ENTITY_DEFINITIONS,
};
