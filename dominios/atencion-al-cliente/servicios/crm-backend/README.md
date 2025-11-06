# Servicio CRM del dominio de Atención al Cliente

Este microservicio consume los eventos `OrderConfirmed` publicados en el bus de eventos
del dominio de Ventas Digitales y mantiene una ficha consolidada de clientes para el CRM
de Atención al Cliente.

## Capacidades

- Asegura la colección `atencionalcliente-customers` en la base documental NoSQL.
- Crea (o asegura) un consumidor dedicado sobre el canal `ventasdigitales.orders` del bus de
  eventos.
- Procesa los eventos `OrderConfirmed` para dar de alta o actualizar a los clientes con la
  información más reciente del pedido.
- Expone un endpoint `POST /tasks/sync` para forzar una sincronización inmediata y un
  `GET /health` con estadísticas básicas del ingestión.

## Puesta en marcha

```js
const { startCrmService } = require('@retailer/atencionalcliente-crm-backend');

(async () => {
  const { url, close } = await startCrmService({
    nosqlUrl: 'http://127.0.0.1:4100',
    eventBusUrl: 'http://127.0.0.1:4200',
  });

  console.log('Servicio CRM escuchando en', url);
  // ...
  await close();
})();
```

El servicio mantiene un ciclo de sincronización periódico que puede ajustarse con la opción
`pollIntervalMs`. También es posible inyectar una instancia propia de `CrmSyncProcessor`
para facilitar pruebas.
