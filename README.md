# Simulador de Retailer - Arquitectura de Dominio

Este repositorio contiene la documentación base para un simulador de un retailer a gran escala. El objetivo es modelar los dominios y flujos fundamentales que intervienen en el ciclo de vida completo de un pedido, desde su creación hasta su cierre, incluyendo los procesos de atención al cliente, logística y contabilidad asociados.

## Escenario general

Imaginamos un retailer omnicanal con canales digitales de venta, centros de distribución y una red de aliados logísticos. El cliente puede comprar desde la web o la app, recibir el pedido a domicilio o retirarlo en tienda, solicitar soporte si surge un problema y gestionar devoluciones o reclamaciones. Cada dominio opera como un microservicio independiente que colabora a través de eventos y APIs para mantener la consistencia del flujo.

## Flujo end-to-end del pedido

1. **Captura y validación del pedido (Ventas Digitales):** el cliente arma su carrito, selecciona dirección y método de pago, y el microservicio valida disponibilidad antes de confirmar la orden.
2. **Orquestación inicial y notificación (Ventas Digitales):** se genera el identificador del pedido y se publican eventos para logística y contabilidad.
3. **Preparación y fulfillment (Logística):** la orden se enruta al centro de distribución o tienda correspondiente, se separan los productos, se embalan y se asigna un transporte o punto de retiro.
4. **Entrega y seguimiento (Logística):** se actualiza el estado de envío y se obtienen confirmaciones de entrega o incidencias.
5. **Atención al cliente:** durante todo el proceso se reciben consultas, solicitudes de información y se gestionan incidencias que puedan requerir escalamientos a logística o ajustes de facturación.
6. **Contabilidad y facturación:** al confirmarse la entrega, se emite la factura, se concilian pagos y se registran impuestos.
7. **Reclamaciones y devoluciones (Flujo inverso):** si el cliente inicia una devolución o reclama por un problema, atención al cliente abre el caso, logística coordina la recolección o recepción del producto y contabilidad actualiza el estado financiero (reembolsos). Ventas digitales refleja los cambios en el pedido original.
8. **Cierre del ciclo de vida:** una vez resueltos todos los casos asociados (entrega exitosa, devoluciones procesadas y cuentas conciliadas), el pedido se marca como cerrado y se alimentan los sistemas analíticos para retroalimentar la operación.

## Dominios contemplados

- [Ventas Digitales](dominios/ventasdigitales/README.md)
- [Atención al Cliente](dominios/atencion-al-cliente/README.md)
- [Logística](dominios/logistica/README.md)
- [Contabilidad](dominios/contabilidad/README.md)

Cada dominio cuenta con una descripción de su responsabilidad, equipos involucrados, usuarios clave y un conjunto inicial de historias de usuario que guían el desarrollo de sus microservicios y microfrontends.

## Lineamientos de implementación

Para mantener la coherencia del ecosistema, todas las piezas de software deberán apegarse a los siguientes criterios operativos y de arquitectura:

- **Entorno de ejecución:** todo el código se desarrolla con Node.js 22 y aplica principios SOLID, favoreciendo módulos pequeños y altamente cohesionados.
- **Estructura de carpetas:**
  - `dominios/<dominio>/servicios/` alberga los microservicios de cada dominio.
  - `dominios/<dominio>/frontales/` contiene los microfrontends asociados.
  - `sistemas/` en la raíz reúne componentes transversales como bases de datos, colas de mensajería u otras piezas de arquitectura de soporte.
  - `lib/` agrupa librerías compartidas reutilizables por servicios y frontales.
- **Pruebas:** cada fichero de código productivo debe ir acompañado de un fichero de pruebas ligero que verifique su comportamiento esencial.
- **Gestión de dependencias:** todas las dependencias se administran con npm. Desde la raíz existirá un script en Node.js que ejecute los `npm install` de todos los paquetes del proyecto en un solo paso.
- **Lanzadores:** se proveerán scripts Node.js en la raíz para orquestar el arranque de todos los servicios/frontales y la ejecución consolidada de los tests. Al finalizar (por ejemplo, mediante `Ctrl+C`) los procesos se cancelarán limpiamente.
- **Estado de los servicios:** cada servicio debe purgar su estado al inicio de la ejecución para garantizar que parte de un contexto limpio.

Estos lineamientos se irán enriqueciendo conforme evolucionen los dominios y las necesidades del simulador.
