# Entidades del dominio de Contabilidad

## ReembolsoReclamacion
- **Descripción:** Solicitud de devolución de fondos asociada a una reclamación aprobada.
- **Atributos clave:**
  - `reembolsoId`: identificador del reembolso.
  - `casoId`: referencia al caso de atención que lo originó.
  - `pedidoId`: pedido vinculado al reembolso.
  - `monto`: importe a devolver al cliente.
  - `fechaAutorizacion`: fecha en la que contabilidad aprueba el reembolso.
  - `estado`: progreso del reembolso (solicitado, en proceso, liquidado).
