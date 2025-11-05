# @retailer/ventasdigitales-ecommerce

Microfrontend inicial para el dominio de Ventas Digitales. Renderiza un checkout compacto que permite seleccionar productos,
completar los datos del cliente y visualizar el evento `OrderConfirmed` que se disparará una vez confirmado el pedido.

## Uso

```js
const { renderWidgetShell } = require('@retailer/ventasdigitales-ecommerce');

const html = renderWidgetShell();
// Inserta el HTML en el dashboard o en el host del microfrontend.
```

El widget expone un contenedor con `data-widget-id="ventasdigitales-ecommerce"` y ocupa dos columnas en el layout del
dashboard. El cliente React se distribuye en `/widgets/ventasdigitales/ecommerce/widget-client.jsx`.

## Desarrollo

Ejecuta las pruebas con:

```bash
npm test --workspace dominios/ventasdigitales/servicios/ecommerce
```
