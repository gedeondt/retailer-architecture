# @retailer/sistemas-event-bus

Un bus de eventos minimalista inspirado en la filosofía NoSQL del repositorio: almacenamiento basado en archivos JSON, sin particiones ni réplicas y con APIs triviales para productores y consumidores.

Cada evento pertenece a un **canal** identificado por nombre. Los canales se crean bajo demanda o al inicializar el log y todas las operaciones (lectura, escritura, métricas y consumo) requieren que se especifique explícitamente el canal objetivo.

## Estructura básica

El paquete expone un `SimpleEventLog` persistente en disco, utilidades para inicializarlo bajo demanda y un servicio HTTP listo para integrarse en el dashboard.

```js
const {
  startEventBus,
  startEventBusService,
  createEventLog,
  SimpleEventLog,
  EventConsumer,
  renderWidgetShell,
} = require('@retailer/sistemas-event-bus');
```

Todos los artefactos viven por defecto en `sistemas/event-bus/data/` (puedes sobreescribir la ruta con la opción `dataDir`). El log asegura IDs secuenciales que comienzan en `1` **por canal** y persiste un registro por línea. La metadata en `meta.json` guarda los canales registrados y su último identificador entregado.

## startEventBus(options)

Inicializa un `SimpleEventLog` listo para usarse y devuelve `{ log, close }`.

- `resetOnStart` (boolean, `true` por defecto): si es `true`, el log se limpia al iniciar **y** al cerrar.
- Cualquier otra opción se pasa al constructor de `SimpleEventLog`.

```js
const { log, close } = await startEventBus({
  dataDir: '/tmp/eventos',
  channels: ['pedidos'],
});

await log.append({
  channel: 'pedidos',
  type: 'pedido.creado',
  payload: { pedidoId: 'P-1' },
});
await close();
```

## startEventBusService(options)

Levanta el servicio HTTP completo y devuelve `{ server, url, log, close }`.

- `port` (`number`, `4200` por defecto) y `host` (`string`, `127.0.0.1`): socket de escucha.
- `dataDir`: carpeta donde se persisten los eventos y offsets.
- `resetOnStart` (`boolean`, `true` por defecto): limpia el log al iniciar y al cerrar.
- `widgetClientPath`: ruta al `widget-client.jsx` a servir.

```js
const { url, close } = await startEventBusService({ port: 0 });
console.log(`Servicio disponible en ${url}`);
// ...
await close();
```

La ejecución directa `node src/server.js` expone la API y el widget con CORS habilitado.

## SimpleEventLog(options)

Constructor de bajo nivel utilizado internamente.

- `dataDir`: carpeta donde se guardan los archivos por canal, `meta.json` y los offsets de consumidores.
- `clock`: función que devuelve `Date`. Útil para pruebas.
- `channels`: array de nombres de canal que se deben preparar tras un `reset()` inicial.

### Métodos principales

- `append({ channel, type?, payload? })`: agrega un evento en el canal indicado con ID autoincremental y marca de tiempo ISO.
- `listEvents({ channel })`: devuelve todos los eventos registrados en el canal solicitado.
- `getEventsSince(offset = 0, { channel })`: filtra los eventos del canal cuyo `id` sea mayor a `offset`.
- `createConsumer(name, { channel })`: registra un consumidor asociado a un canal concreto y devuelve una instancia de `EventConsumer` ligada a dicho canal.
- `listConsumers({ channel? })`: lista los consumidores registrados opcionalmente filtrados por canal, incluyendo su `offset` y la fecha de última actualización.
- `reset()`: borra eventos y offsets dejándolo en estado limpio.

## EventConsumer

Representa un consumidor con offset persistente en disco (`data/consumers/<canal>/<nombre>.json`).

- `poll({ limit = Infinity, autoCommit = true } = {})`: obtiene eventos del canal asociado a partir del último offset. Si `autoCommit` es `true`, guarda el offset del último evento recibido.
- `commit(lastEventId)`: fija manualmente el offset en el ID indicado.
- `reset()`: reinicia el offset a `0`.
- `getOffset()`: devuelve el offset persistido sin modificarlo.

Ejemplo de consumo manual:

```js
const consumer = await log.createConsumer('facturacion', { channel: 'pedidos' });
const batch = await consumer.poll({ limit: 10, autoCommit: false });
// procesar batch...
if (batch.length > 0) {
  await consumer.commit(batch.at(-1).id);
}
```

## API HTTP

El servicio expone endpoints REST con CORS habilitado (origen dinámico según el `Origin` recibido).

### Eventos (`/events`)

- `GET /events?channel=<canal>&since=<offset>&limit=<n>`: lista eventos en orden ascendente dentro del canal indicado. `since` y `limit` son opcionales.
- `POST /events`: crea un evento. Cuerpo JSON `{ channel, type?, payload? }`.
- `DELETE /events`: resetea el log (eventos y offsets).

```bash
curl -X POST http://localhost:4200/events \
  -H 'Content-Type: application/json' \
  -d '{"channel":"pedidos","type":"pedido.creado","payload":{"id":"P-1"}}'
```

- `GET /consumers?channel=<canal>`: devuelve `{ items: [{ name, channel, offset, updatedAt }] }` del canal solicitado.
- `POST /consumers`: crea (o asegura) un consumidor. Cuerpo `{ name, channel }`.
- `POST /consumers/:name/poll?channel=<canal>`: obtiene eventos pendientes del canal asociado. Cuerpo opcional `{ limit?, autoCommit? }`.
- `POST /consumers/:name/commit?channel=<canal>`: fija manualmente el offset. Cuerpo `{ lastEventId }`.
- `POST /consumers/:name/reset?channel=<canal>`: reinicia el offset a `0`.

El endpoint `poll` devuelve `{ name, channel, items, committedOffset, lastDeliveredEventId }`, permitiendo inspeccionar si el `autoCommit` avanzó el offset.

### Métricas y widget

- `GET /overview?channel=<canal>`: agrega métricas (`totalEvents`, `highWatermark`, `recentEvents`, `consumers`) usadas por el dashboard para el canal indicado.
- `GET /widget`: entrega el HTML del widget (`renderWidgetShell`). Acepta `?apiOrigin=<url>` para forzar el origen de las APIs.
- `GET /widget/client.jsx`: expone el cliente React que renderiza el widget (sin caché).

## Observabilidad y logs

Durante su ejecución el servicio escribe logs con el prefijo `[event-bus]` que quedan disponibles en el visor del launcher:

- Cada petición HTTP registra un log `debug` con el método y la ruta recibida (incluidos los preflight `OPTIONS`).
- Operaciones exitosas sobre `/events` y `/consumers` generan mensajes `info` describiendo el canal, consumidor o identificador afectado.
- Los errores inesperados quedan registrados con nivel `error` antes de responder con `500`.

Estos mensajes permiten verificar desde el dashboard si se están publicando eventos, leyendo consumidores o consultando métricas sin inspeccionar manualmente la consola.

## Widget para el dashboard

`renderWidgetShell()` genera un fragmento HTML con `data-widget-id="sistemas-event-bus"`, tamaño `col-span-2` y un contenedor `#event-bus-root`. El widget cliente consume `/overview` cada 15 segundos, muestra:

- Estadísticas clave (eventos totales, consumidores registrados, último evento).
- Lista de los 10 eventos más recientes con sus cargas.
- Tabla de consumidores con offset, pendientes y última actualización.

El contenedor acepta el atributo `data-api-origin` para apuntar a entornos remotos; de lo contrario utiliza el origen actual.

## Errores comunes

- El `append` valida que se envíe un objeto: lanza `TypeError` si no.
- Los offsets deben ser enteros ≥ 0 (`TypeError`).
- Los nombres de consumidor se codifican con `encodeURIComponent`, por lo que conviene evitar espacios.
- La API HTTP responde `415` si el `Content-Type` no es `application/json` en peticiones con cuerpo.

## Reset de datos

`SimpleEventLog#reset()` deja el sistema en blanco. Úsalo en pruebas o al reiniciar entornos locales donde quieras un estado reproducible. El servicio HTTP expone esta operación vía `DELETE /events`.
