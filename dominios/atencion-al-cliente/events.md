# Eventos del dominio de Atención al Cliente

Los siguientes eventos se publican para coordinar las sagas de reclamaciones y seguimiento postventa.

```json
{
  "name": "CustomerClaimRegistered",
  "description": "Se emite cuando el dominio crea un caso asociado a una reclamación o incidencia del cliente.",
  "payload": {
    "caseId": "uuid",
    "orderId": "uuid",
    "customerId": "uuid",
    "channel": "web|app|contact_center",
    "category": "claim|incident|inquiry",
    "reportedIssue": "string",
    "requestedActions": ["refund", "reshipment", "investigation"],
    "priority": "low|medium|high",
    "createdAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["logistica", "contabilidad", "ventasdigitales"],
  "saga": "Gestion de reclamaciones"
}
```

```json
{
  "name": "CustomerClaimResolved",
  "description": "Comunica la resolución acordada para un caso abierto y habilita la orquestación de devoluciones, reembolsos o comunicaciones finales.",
  "payload": {
    "caseId": "uuid",
    "orderId": "uuid",
    "resolutionType": "refund|reshipment|denied",
    "resolutionNotes": "string",
    "actionsCommitted": ["refund_initiated", "reshipment_requested", "closure_notified"],
    "resolvedBy": "agentId",
    "resolvedAt": "ISO-8601 timestamp"
  },
  "consumedBy": ["logistica", "contabilidad", "ventasdigitales"],
  "saga": "Gestion de reclamaciones"
}
```
