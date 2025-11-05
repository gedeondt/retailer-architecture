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
- **Lanzadores:** se proveerán scripts Node.js en la raíz para orquestar el arranque de todos los servicios/frontales y la ejecución consolidada de los tests. Deben exponer parámetros para ajustar los puertos y directorios de trabajo de cada servicio y encargarse de detenerlos limpiamente al finalizar (por ejemplo, mediante `Ctrl+C`).
- **Estado de los servicios:** cada servicio debe purgar su estado al inicio de la ejecución para garantizar que parte de un contexto limpio.
- **Frontales:** todos los microfrontends deben entregar fragmentos HTML sin etiquetas `<html>` o `<body>` y exponer un cliente listo para el navegador servido por el mismo origen del widget. El dashboard carga React 18, ReactDOM 18 y Babel standalone, por lo que los widgets pueden asumir que `window.React`, `window.ReactDOM` y `Babel` están disponibles globalmente; evita volver a importarlos desde el widget. Se priorizará Tailwind UI, ya disponible en el dashboard, y se evitará CSS adicional salvo que sea imprescindible. Está prohibido depender de CDNs externos para librerías críticas adicionales: cualquier runtime que no provea el dashboard deberá empaquetarse y servirse desde el propio servicio. Los microfronts deberán exponer atributos de configuración (`data-*`) para recibir parámetros como la URL base de sus APIs.
- **Integraciones cross-origin:** cualquier servicio o widget que vaya a ser consumido por el launcher debe habilitar CORS con un origen comodín o configurable y responder a las peticiones `OPTIONS` de preflight. Esto aplica tanto al HTML de los microfronts (`/widget`) como a las APIs REST que utilicen. La omisión de estas cabeceras impedirá que el navegador cargue el microfront.
- **Launcher general:** el lanzador expondrá un dashboard web que integra Tailwind UI y será el responsable de invocar cada script Node.js con los parámetros necesarios, armonizando la configuración de toda la arquitectura.

Estos lineamientos se irán enriqueciendo conforme evolucionen los dominios y las necesidades del simulador.

## Dashboard del launcher

El dashboard del launcher funciona como el punto de entrada visual para los microfronts. Su diseño responde a los siguientes principios:

- **Menú principal organizado por contexto:** la barra superior permite saltar entre la vista de inicio (con widgets seleccionados), la biblioteca completa de widgets por dominio y los sistemas transversales.
- **Rejilla de cuatro columnas:** la distribución base trabaja con una grilla responsiva de cuatro columnas en escritorio. Cada microfront define el ancho de su contenedor (1, 2 o 4 columnas) mediante las clases utilitarias de Tailwind, lo que facilita combinar widgets panorámicos con otros más compactos.
- **Widgets auto descriptivos:** los contenedores incluyen metadatos (`data-widget-id` y `data-widget-size`) para que el launcher pueda identificar y orquestar cada microfront en futuras iteraciones.
- **Estética coherente:** se apalanca Tailwind UI para lograr un aspecto clásico de dashboard sin necesidad de estilos personalizados.

### Prueba de concepto inicial

La raíz del repositorio incluye un `launcher.js` que levanta un servidor HTTP mínimo y sirve un dashboard de ejemplo con widgets simulados. El contenido HTML del dashboard vive en la carpeta [`dashboard/`](dashboard), donde se encuentran páginas independientes para **Inicio**, **Dominios** y **Sistemas**. Esta separación mantiene el lanzador ligero y permite navegar entre vistas completas sin recurrir a anclas.

Para visualizarlo:

```bash
node launcher.js
```

El comando imprimirá en consola la URL local del dashboard. Al abrirla en el navegador se podrá validar la composición visual del panel maestro y desplazarse entre las distintas páginas mediante los enlaces del menú superior.

## Ejemplo de microfront HelloWorld

Para facilitar que los equipos creen nuevos microfronts con la misma apariencia que el widget de la base NoSQL, se define un servicio de referencia `helloworld`. El objetivo es clonar la estructura del microfront existente y limitarse a cambiar el contenido del cliente.

### Estructura recomendada del servicio

```
sistemas/
  helloworld/
    package.json
    src/
      server.js
      widget-shell.js
      widget-client.jsx
    tests/
      server.test.js
      widget-shell.test.js
```

- **`src/server.js`** expone dos rutas: `GET /widget` para servir el HTML del microfront y `GET /widget/client.jsx` para entregar el cliente React. Puede basarse en [`sistemas/nosql-db/src/server.js`](sistemas/nosql-db/src/server.js) reutilizando la configuración de CORS, los headers de caché y el registro del widget shell.
- **`src/widget-shell.js`** genera el fragmento HTML con los mismos metadatos (`data-widget-id`, `data-widget-size`) y un contenedor raíz (`<div id="helloworld-root">`). Puede copiarse de [`sistemas/nosql-db/src/widget-shell.js`](sistemas/nosql-db/src/widget-shell.js) cambiando únicamente los identificadores y el texto visible.
- **`src/widget-client.jsx`** monta el contenido en `#helloworld-root`. Un ejemplo mínimo sería:

  ```jsx
  const root = document.getElementById('helloworld-root');
  const App = () => <h2 className="text-2xl font-semibold">Hello world!</h2>;
  ReactDOM.createRoot(root).render(<App />);
  ```

### Pruebas sugeridas

- Duplicar las pruebas de [`sistemas/nosql-db/tests/server.test.js`](sistemas/nosql-db/tests/server.test.js) y [`sistemas/nosql-db/tests/collection-store.test.js`](sistemas/nosql-db/tests/collection-store.test.js), ajustando los nombres de los endpoints y del widget para comprobar que se sirven los recursos esperados.
- Añadir un `widget-shell.test.js` que valide que `renderWidgetShell()` incluye `data-widget-id="sistemas-helloworld"` y monta el cliente en el elemento correcto.

### Instalación y ejecución

1. Crear el paquete con `npm init -y` y copiar los scripts `start` y `test` del servicio NoSQL.
2. Ejecutar `npm install` para instalar las dependencias compartidas (`express`, `cors`, `supertest`, `react`, `react-dom`).
3. Registrar el microfront en el `launcher` añadiendo la ruta del servicio `helloworld` y referenciando su `renderWidgetShell()`.

Este ejemplo funciona como plantilla para que cualquier nuevo microfront mantenga la misma envoltura visual, rutas y convenciones del ecosistema.
