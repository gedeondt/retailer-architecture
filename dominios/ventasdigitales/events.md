# Eventos del dominio de Ventas Digitales

Estos eventos disparan las sagas principales del ciclo de vida del pedido y comunican acciones iniciadas por el cliente.

```json
{
  "name": "OrderConfirmed",
  "description": "Declara que el checkout finalizó correctamente y el pedido queda listo para fulfillment.",
  "payload": {
    "orderId": "uuid",
    "customerId": "uuid",
    "paymentId": "uuid",
    "items": [
      {
        "sku": "string",
        "quantity": "number",
        "price": "number"
      }
    ],
    "totalAmount": "number",
    "currency": "ISO-4217",
    "confirmedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["logistica", "contabilidad", "atencion-al-cliente"],
  "saga": "Cumplimiento del pedido"
}
```

```json
{
  "name": "PaymentSettled",
  "description": "Notifica que el cargo del pedido fue autorizado o capturado según el medio de pago.",
  "payload": {
    "paymentId": "uuid",
    "orderId": "uuid",
    "status": "authorized|captured|failed",
    "amount": "number",
    "currency": "ISO-4217",
    "processedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["contabilidad"],
  "saga": "Conciliacion de pagos"
}
```

```json
{
  "name": "ReturnRequested",
  "description": "El cliente inicia una solicitud de devolución desde los canales digitales.",
  "payload": {
    "returnId": "uuid",
    "orderId": "uuid",
    "customerId": "uuid",
    "items": [
      {
        "sku": "string",
        "quantity": "number",
        "reason": "string"
      }
    ],
    "pickupOption": "carrier_pickup|dropoff",
    "requestedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["logistica", "atencion-al-cliente"],
  "saga": "Gestion de devoluciones"
}
```

```json
{
  "name": "ClaimRoutedToSupport",
  "description": "Escala una reclamación iniciada en el canal digital hacia el dominio de atención al cliente.",
  "payload": {
    "caseId": "uuid",
    "orderId": "uuid",
    "customerId": "uuid",
    "claimReason": "string",
    "supportingEvidence": ["url"],
    "submittedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["atencion-al-cliente"],
  "saga": "Gestion de reclamaciones"
}
```
