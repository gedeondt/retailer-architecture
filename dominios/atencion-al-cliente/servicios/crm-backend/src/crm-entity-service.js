'use strict';

const { URL } = require('node:url');

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

function safeNumber(value) {
  if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number(value);
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

function mapOrderRecord(record) {
  const value = record?.value || {};
  return {
    id: record?.id ?? null,
    orderId: safeString(value.orderId),
    customerId: safeString(value.customerId),
    status: safeString(value.status),
    channelOrigin: safeString(value.channelOrigin),
    confirmedAt: safeString(value.confirmedAt),
    totalAmount: safeNumber(value.totalAmount),
    totalCurrency: safeString(value.totalCurrency),
    paymentId: safeString(value.paymentId),
    paymentMethod: safeString(value.paymentMethod),
    paymentStatus: safeString(value.paymentStatus),
    paymentAmount: safeNumber(value.paymentAmount),
    paymentCurrency: safeString(value.paymentCurrency),
  };
}

function mapOrderItemRecord(record) {
  const value = record?.value || {};
  const promotions = Array.isArray(value.promotions)
    ? value.promotions.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    : [];

  return {
    id: record?.id ?? null,
    itemId: safeString(value.itemId),
    orderId: safeString(value.orderId),
    customerId: safeString(value.customerId),
    sku: safeString(value.sku),
    quantity: safeNumber(value.quantity),
    unitPrice: safeNumber(value.unitPrice),
    lineTotal: safeNumber(value.lineTotal),
    promotions: promotions.length > 0 ? promotions.join(', ') : null,
    position: safeNumber(value.position),
    status: safeString(value.status),
    confirmedAt: safeString(value.confirmedAt),
  };
}

function mapPaymentRecord(record) {
  const value = record?.value || {};
  return {
    id: record?.id ?? null,
    paymentId: safeString(value.paymentId),
    orderId: safeString(value.orderId),
    customerId: safeString(value.customerId),
    method: safeString(value.method),
    status: safeString(value.status),
    amount: safeNumber(value.amount),
    currency: safeString(value.currency),
    confirmedAt: safeString(value.confirmedAt),
  };
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
      { key: 'channelOrigin', label: 'Canal' },
      { key: 'confirmedAt', label: 'Confirmado el' },
      { key: 'totalAmount', label: 'Importe total' },
      { key: 'totalCurrency', label: 'Moneda' },
      { key: 'paymentMethod', label: 'Método de pago' },
      { key: 'paymentStatus', label: 'Estado del pago' },
    ],
  },
  {
    id: 'crm-order-items',
    name: 'Ítems de pedido',
    description: 'Detalle de líneas de pedido asociadas a los clientes del CRM.',
    fields: [
      { key: 'itemId', label: 'ID Ítem' },
      { key: 'orderId', label: 'ID Pedido' },
      { key: 'customerId', label: 'ID Cliente' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Cantidad' },
      { key: 'unitPrice', label: 'Precio unitario' },
      { key: 'lineTotal', label: 'Total línea' },
      { key: 'promotions', label: 'Promociones' },
    ],
  },
  {
    id: 'crm-order-payments',
    name: 'Pagos de pedido',
    description: 'Pagos relacionados con los pedidos sincronizados en el CRM.',
    fields: [
      { key: 'paymentId', label: 'ID Pago' },
      { key: 'orderId', label: 'ID Pedido' },
      { key: 'customerId', label: 'ID Cliente' },
      { key: 'method', label: 'Método' },
      { key: 'status', label: 'Estado' },
      { key: 'amount', label: 'Importe' },
      { key: 'currency', label: 'Moneda' },
    ],
  },
];

const DEFAULT_PAGE_SIZE = 10;

class EntityServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

class CrmEntityService {
  constructor(options = {}) {
    const {
      processor,
      fetchImpl,
      nosqlUrl = processor?.nosqlUrl ?? 'http://127.0.0.1:4100',
      collectionName = processor?.collection?.name,
      customersCollectionName = processor?.collections?.customers?.name ?? collectionName,
      ordersCollectionName = processor?.collections?.orders?.name ?? 'atencionalcliente-orders',
      orderItemsCollectionName = processor?.collections?.orderItems?.name ?? 'atencionalcliente-order-items',
      orderPaymentsCollectionName = processor?.collections?.orderPayments?.name ?? 'atencionalcliente-order-payments',
      defaultPageSize = DEFAULT_PAGE_SIZE,
    } = options;

    const resolvedFetch = processor?.fetch || fetchImpl;
    this.fetch = ensureFetch(resolvedFetch);
    this.nosqlUrl = nosqlUrl;
    this.collections = {
      customers: customersCollectionName || 'atencionalcliente-customers',
      orders: ordersCollectionName,
      orderItems: orderItemsCollectionName,
      orderPayments: orderPaymentsCollectionName,
    };
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
      case 'crm-order-items':
        return { entity: definition, ...(await this.listOrderItems(options)) };
      case 'crm-order-payments':
        return { entity: definition, ...(await this.listOrderPayments(options)) };
      default:
        throw new EntityServiceError(404, `Entidad ${entityId} no encontrada`);
    }
  }

  async listCustomers(options = {}) {
    const page = parsePositiveInteger(options.page, 1);
    const pageSize = parsePositiveInteger(options.pageSize, this.defaultPageSize);

    const payload = await this.fetchCollectionPage(this.collections.customers, { page, pageSize });
    const items = Array.isArray(payload?.items) ? payload.items.map(mapCustomerRecord) : [];

    return {
      page: payload?.page ?? page,
      pageSize: payload?.pageSize ?? pageSize,
      totalItems: payload?.totalItems ?? items.length,
      totalPages: payload?.totalPages ?? (items.length === 0 ? 0 : 1),
      items,
    };
  }

  async listOrders(options = {}) {
    const page = parsePositiveInteger(options.page, 1);
    const pageSize = parsePositiveInteger(options.pageSize, this.defaultPageSize);

    const payload = await this.fetchCollectionPage(this.collections.orders, { page, pageSize });
    const items = Array.isArray(payload?.items) ? payload.items.map(mapOrderRecord) : [];

    return {
      page: payload?.page ?? page,
      pageSize: payload?.pageSize ?? pageSize,
      totalItems: payload?.totalItems ?? items.length,
      totalPages: payload?.totalPages ?? (items.length === 0 ? 0 : 1),
      items,
    };
  }

  async listOrderItems(options = {}) {
    const page = parsePositiveInteger(options.page, 1);
    const pageSize = parsePositiveInteger(options.pageSize, this.defaultPageSize);

    const payload = await this.fetchCollectionPage(this.collections.orderItems, { page, pageSize });
    const items = Array.isArray(payload?.items) ? payload.items.map(mapOrderItemRecord) : [];

    return {
      page: payload?.page ?? page,
      pageSize: payload?.pageSize ?? pageSize,
      totalItems: payload?.totalItems ?? items.length,
      totalPages: payload?.totalPages ?? (items.length === 0 ? 0 : 1),
      items,
    };
  }

  async listOrderPayments(options = {}) {
    const page = parsePositiveInteger(options.page, 1);
    const pageSize = parsePositiveInteger(options.pageSize, this.defaultPageSize);

    const payload = await this.fetchCollectionPage(this.collections.orderPayments, { page, pageSize });
    const items = Array.isArray(payload?.items) ? payload.items.map(mapPaymentRecord) : [];

    return {
      page: payload?.page ?? page,
      pageSize: payload?.pageSize ?? pageSize,
      totalItems: payload?.totalItems ?? items.length,
      totalPages: payload?.totalPages ?? (items.length === 0 ? 0 : 1),
      items,
    };
  }

  async fetchCollectionPage(collectionName, { page, pageSize }) {
    if (!collectionName) {
      throw new EntityServiceError(500, 'Colección CRM no configurada');
    }

    const url = new URL(`/collections/${collectionName}/items`, this.nosqlUrl);
    url.searchParams.set('page', page);
    url.searchParams.set('pageSize', pageSize);

    const response = await this.fetch(url);
    if (response.status !== 200) {
      const message = await parseErrorMessage(response, 'No se pudieron obtener los datos del CRM');
      throw new EntityServiceError(response.status, message);
    }

    return response.json();
  }

  async fetchAllCustomerRecords() {
    const records = [];
    let page = 1;
    const pageSize = 50;

    while (true) {
      const payload = await this.fetchCollectionPage(this.collections.customers, { page, pageSize });
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
