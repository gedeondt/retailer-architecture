# Eventos del dominio de Contabilidad

Los siguientes eventos habilitan la coordinación financiera en las sagas de cumplimiento y devoluciones.

```json
{
  "name": "InvoiceIssued",
  "description": "Confirma que la venta ha sido registrada y la factura quedó disponible para el cliente.",
  "payload": {
    "invoiceId": "uuid",
    "orderId": "uuid",
    "customerId": "uuid",
    "totalAmount": "number",
    "currency": "ISO-4217",
    "taxAmount": "number",
    "issuedAt": "ISO-8601 timestamp",
    "downloadUrl": "string"
  },
  "consumedBy": ["ventasdigitales", "atencion-al-cliente"],
  "saga": "Ciclo de facturacion del pedido"
}
```

```json
{
  "name": "PaymentReconciled",
  "description": "Indica que el cobro del pedido quedó conciliado contra el pago recibido en las pasarelas.",
  "payload": {
    "orderId": "uuid",
    "paymentId": "uuid",
    "reconciliationStatus": "matched|mismatch",
    "reconciliationNotes": "string",
    "reconciledAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["ventasdigitales"],
  "saga": "Conciliacion de pagos"
}
```

```json
{
  "name": "RefundProcessed",
  "description": "Se emite cuando un reembolso asociado a una devolución o reclamación quedó confirmado en contabilidad.",
  "payload": {
    "refundId": "uuid",
    "orderId": "uuid",
    "caseId": "uuid",
    "amount": "number",
    "currency": "ISO-4217",
    "reason": "string",
    "processedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["ventasdigitales", "atencion-al-cliente"],
  "saga": "Gestion de devoluciones"
}
```
