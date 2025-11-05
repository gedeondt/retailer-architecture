# @retailer/sistemas-event-bus

Un bus de eventos minimalista inspirado en la filosofía NoSQL del repositorio: almacenamiento basado en archivos JSON, sin particiones ni réplicas y con APIs triviales para productores y consumidores.

## Estructura básica

El paquete expone un `SimpleEventLog` persistente en disco y utilidades para inicializarlo bajo demanda.

```
const {
  startEventBus,
  createEventLog,
  SimpleEventLog,
  EventConsumer,
} = require('@retailer/sistemas-event-bus');
```

Todos los artefactos viven por defecto en `sistemas/event-bus/data/` (puedes sobreescribir la ruta con la opción `dataDir`). El log asegura IDs secuenciales que comienzan en `1` y persiste un registro por línea.

## startEventBus(options)

Inicializa un `SimpleEventLog` listo para usarse y devuelve `{ log, close }`.

- `resetOnStart` (boolean, `true` por defecto): si es `true`, el log se limpia al iniciar **y** al cerrar.
- Cualquier otra opción se pasa al constructor de `SimpleEventLog`.

```js
const { log, close } = await startEventBus({ dataDir: '/tmp/eventos' });
await log.append({ type: 'pedido.creado', payload: { pedidoId: 'P-1' } });
await close();
```

## SimpleEventLog(options)

Constructor de bajo nivel utilizado internamente.

- `dataDir`: carpeta donde se guardan `events.log`, `meta.json` y los offsets de consumidores.
- `clock`: función que devuelve `Date`. Útil para pruebas.

### Métodos principales

- `append({ type?, payload? })`: agrega un evento con ID autoincremental y marca de tiempo ISO.
- `listEvents()`: devuelve todos los eventos registrados.
- `getEventsSince(offset = 0)`: filtra los eventos con `id` mayor a `offset`.
- `createConsumer(name)`: registra un consumidor y devuelve una instancia de `EventConsumer` asociada.
- `reset()`: borra eventos y offsets dejándolo en estado limpio.

## EventConsumer

Representa un consumidor con offset persistente en disco (`data/consumers/<nombre>.json`).

- `poll({ limit = Infinity, autoCommit = true } = {})`: obtiene eventos a partir del último offset. Si `autoCommit` es `true`, guarda el offset del último evento recibido.
- `commit(lastEventId)`: fija manualmente el offset en el ID indicado.
- `reset()`: reinicia el offset a `0`.

Ejemplo de consumo manual:

```js
const consumer = await log.createConsumer('facturacion');
const batch = await consumer.poll({ limit: 10, autoCommit: false });
// procesar batch...
if (batch.length > 0) {
  await consumer.commit(batch.at(-1).id);
}
```

## Errores comunes

- El `append` valida que se envíe un objeto: lanzar `TypeError` si no.
- Los offsets deben ser enteros ≥ 0 (`TypeError`).
- Los nombres de consumidor se codifican con `encodeURIComponent`, por lo que conviene evitar espacios.

## Reset de datos

`SimpleEventLog#reset()` deja el sistema en blanco. Úsalo en pruebas o al reiniciar entornos locales donde quieras un estado reproducible.
