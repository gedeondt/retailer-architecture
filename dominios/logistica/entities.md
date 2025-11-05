# Entidades del dominio de Logística

## OrdenFulfillment
- **Descripción:** Orden operativa que agrupa las tareas de preparación de un pedido.
- **Atributos clave:**
  - `ordenFulfillmentId`: identificador de la orden.
  - `pedidoId`: pedido a preparar.
  - `centroAsignado`: centro de distribución o tienda responsable.
  - `estado`: etapa actual (pendiente, en picking, empacado, listo para despacho).
  - `fechaCompromiso`: fecha objetivo de salida.

## TareaPicking
- **Descripción:** Unidad de trabajo para recoger productos específicos de inventario.
- **Atributos clave:**
  - `tareaId`: identificador de la tarea.
  - `ordenFulfillmentId`: orden a la que pertenece.
  - `sku`: producto a recoger.
  - `cantidad`: unidades requeridas.
  - `ubicacionInventario`: posición física en almacén.
  - `estado`: progreso (asignada, en curso, completada).

## Envio
- **Descripción:** Movimiento de salida del pedido hacia el cliente o punto de retiro.
- **Atributos clave:**
  - `envioId`: identificador del envío.
  - `pedidoId`: pedido asociado.
  - `transportista`: aliado logístico o flota propia responsable.
  - `tipoEntrega`: modalidad (domicilio, retiro en tienda, locker).
  - `estado`: seguimiento (en tránsito, intento fallido, entregado, incidente).
  - `tracking`: código de rastreo o guía.

## RecepcionDevolucion
- **Descripción:** Registro de la recepción física de una devolución o recolección.
- **Atributos clave:**
  - `recepcionId`: identificador del registro.
  - `pedidoId`: pedido relacionado.
  - `motivo`: causa de la devolución o recolección.
  - `condicionProducto`: evaluación del estado del artículo.
  - `fechaRecepcion`: fecha de ingreso al almacén o tienda.
  - `estado`: estatus del procesamiento (pendiente de revisión, aceptada, rechazada).
