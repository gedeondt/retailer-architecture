# Entidades del dominio de Ventas Digitales

## PedidoDigital
- **Descripción:** Pedido confirmado a través de los canales digitales que coordina el resto del flujo.
- **Atributos clave:**
  - `pedidoId`: identificador único del pedido.
  - `clienteId`: referencia al comprador.
  - `canalOrigen`: canal de compra (web, app, marketplace).
  - `estado`: fase actual del pedido (confirmado, en preparación, enviado, completado, reclamado).
  - `total`: monto total confirmado del pedido.
  - `metodosPago`: lista de identificadores de pagos aplicados.

## LineaPedidoDigital
- **Descripción:** Artículo incluido en el pedido con el detalle confirmado al cierre del checkout.
- **Atributos clave:**
  - `lineaId`: identificador de la línea dentro del pedido.
  - `sku`: código del producto.
  - `cantidad`: número de unidades.
  - `precioUnitario`: precio final aplicado por unidad.
  - `promocionesAplicadas`: beneficios o cupones utilizados.

## PagoPedidoDigital
- **Descripción:** Registro de un pago capturado o en proceso para el pedido.
- **Atributos clave:**
  - `pagoId`: identificador del pago.
  - `pedidoId`: referencia al pedido asociado.
  - `metodo`: forma de pago (tarjeta, wallet, puntos, etc.).
  - `monto`: valor aplicado con el método.
  - `estado`: estatus del cobro (pendiente, autorizado, capturado, fallido, reembolsado parcial).
  - `transaccionPasarelaId`: identificador en la pasarela externa.

## SolicitudClienteDigital
- **Descripción:** Requerimiento iniciado desde los canales digitales para aclaraciones, reclamaciones o descarga de documentos.
- **Atributos clave:**
  - `solicitudId`: identificador de la solicitud.
  - `pedidoId`: pedido relacionado.
  - `tipo`: naturaleza de la solicitud (reclamación, seguimiento, factura).
  - `estado`: progreso de la solicitud (abierta, en gestión, resuelta).
  - `canalContacto`: medio por el que se originó (portal, app, chatbot).
  - `referenciaExterna`: enlaces o identificadores compartidos con atención al cliente.
