# Dominio de Contabilidad

## Propósito y alcance
Administra la facturación, conciliación de pagos, registro contable y gestión de impuestos asociados a los pedidos. También controla los reembolsos derivados de reclamaciones o devoluciones aprobadas.

## Equipo y usuarios
- **Equipo financiero:** contadores, analistas de revenue, especialistas fiscales y tesorería.
- **Usuarios internos:** analistas de conciliación, backoffice de pagos, auditores internos.
- **Usuarios externos:** entidades bancarias, proveedores de pasarelas de pago, organismos reguladores y clientes que reciben facturas o reembolsos.

## Responsabilidades en el flujo del pedido
- Recibir eventos de pedido confirmado y registrar la venta, impuestos y cobros asociados.
- Emitir facturas y documentos fiscales conforme a la normativa.
- Gestionar reembolsos cuando se procesa una devolución o reclamación.
- Conciliar los pagos recibidos con las entregas confirmadas y reportar indicadores financieros.

## Historias de usuario
1. Como **analista de conciliación** quiero ver los pagos aplicados a cada pedido para asegurar que no existan desajustes contables.
2. Como **contador** quiero auditar los reembolsos asociados a reclamaciones para asegurar que se registren con los impuestos correctos.
3. Como **cliente** quiero descargar mi factura y ver el estado de un reembolso desde el portal de pedidos.

## Modelo de entidades
- [Entidades del dominio de Contabilidad](entities.md)
- [Eventos publicados](events.md)
