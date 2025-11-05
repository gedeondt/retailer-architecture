# Entidades del dominio de Atención al Cliente

## CasoAtencion
- **Descripción:** Registro maestro de una incidencia, consulta o reclamación del cliente.
- **Atributos clave:**
  - `casoId`: identificador del caso.
  - `pedidoId`: pedido asociado cuando aplica.
  - `tipo`: categoría del caso (consulta, reclamación, devolución, seguimiento).
  - `prioridad`: nivel de urgencia calculado.
  - `estado`: fase del caso (abierto, en análisis, en espera, resuelto, cerrado).
  - `canalIngreso`: medio por el que se recibió (teléfono, portal, chatbot).
