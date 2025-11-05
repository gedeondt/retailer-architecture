# Eventos del dominio de Logística

Los siguientes eventos permiten sincronizar el cumplimiento físico de pedidos y devoluciones dentro de las sagas operativas.

```json
{
  "name": "FulfillmentTasksPrepared",
  "description": "El almacén completó picking y packing y el envío está listo para ser entregado al transportista.",
  "payload": {
    "shipmentId": "uuid",
    "orderId": "uuid",
    "warehouseId": "uuid",
    "packages": [
      {
        "packageId": "uuid",
        "weight": "number",
        "dimensions": "LxWxH",
        "containsHazardousMaterials": "boolean"
      }
    ],
    "readyAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["ventasdigitales", "atencion-al-cliente"],
  "saga": "Cumplimiento del pedido"
}
```

```json
{
  "name": "ShipmentDelivered",
  "description": "Confirma la entrega al cliente final y cierra el segmento logístico de la saga de fulfillment.",
  "payload": {
    "shipmentId": "uuid",
    "orderId": "uuid",
    "deliveredAt": "ISO-8601 timestamp",
    "recipient": {
      "name": "string",
      "idDocument": "string"
    },
    "deliveryNotes": "string"
  },
  "consumedBy": ["ventasdigitales", "contabilidad", "atencion-al-cliente"],
  "saga": "Cumplimiento del pedido"
}
```

```json
{
  "name": "ReturnInspected",
  "description": "Se emite tras validar el estado físico del producto devuelto para destrabar reembolsos o reenvíos.",
  "payload": {
    "returnId": "uuid",
    "orderId": "uuid",
    "caseId": "uuid",
    "inspectionOutcome": "approved|rejected|partial",
    "conditionNotes": "string",
    "inspectedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["contabilidad", "ventasdigitales", "atencion-al-cliente"],
  "saga": "Gestion de devoluciones"
}
```
