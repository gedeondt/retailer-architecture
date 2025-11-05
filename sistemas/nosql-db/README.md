# @retailer/sistemas-nosql-db

Servicio HTTP que ofrece una base de datos documental mínima (sin replicación ni particiones) apoyada en archivos JSON planos. Está pensado para experimentación local y entornos de demo.

## Puesta en marcha

```js
const { startNosqlService } = require('@retailer/sistemas-nosql-db');

(async () => {
  const { url, close, store } = await startNosqlService({
    port: 4100,
    host: '127.0.0.1',
    dataDir: '/tmp/nosql',
  });

  console.log('API disponible en', url);
  // ...
  await close();
})();
```

- `dataDir`: carpeta donde se serializan colecciones y metadatos. Al iniciar se limpia por completo.
- `store`: instancia de `CollectionStore` reutilizable en pruebas.

## APIs REST

Todas las respuestas son JSON con `Content-Type: application/json` salvo el widget embebible. Se incluyen cabeceras CORS abiertas (`Access-Control-Allow-Origin`).

### Colecciones

`GET /collections`
: Lista las colecciones registradas.

```json
{
  "items": [
    { "name": "clientes", "indexField": "email", "itemCount": 12, "throughput": 3 }
  ],
  "totalCollections": 1,
  "storage": { "limitBytes": 10485760, "usedBytes": 5120, "freeBytes": 10480640 }
}
```

`POST /collections`
: Crea una colección. Cuerpo:

```json
{ "name": "clientes", "indexField": "email" }
```

Errores frecuentes:
- 409 si el nombre ya existe.
- 400 si el nombre o el índice no cumplen las validaciones (`[a-z0-9_-]+`).

### Documentos

`POST /collections/:collection/items`
: Inserta un documento JSON. El campo indicado por `indexField` es obligatorio. Devuelve `{ id, value }`.

`GET /collections/:collection/items`
: Lista paginada (`page`, `pageSize` query, ambos ≥1). Respuesta:

```json
{
  "items": [{ "id": "<uuid>", "value": { "email": "foo@bar" } }],
  "totalItems": 1,
  "totalPages": 1,
  "page": 1,
  "pageSize": 10
}
```

`GET /collections/:collection/items/:id`
: Recupera un documento concreto. 404 si no existe.

`PUT /collections/:collection/items/:id`
: Sustituye el documento. Valida límite de almacenamiento y que exista el campo indexado.

`DELETE /collections/:collection/items/:id`
: Borra el documento y libera espacio (respuesta `{ "id": "..." }`).

### Búsquedas

`GET /collections/:collection/search?query=...`
: Busca por coincidencias parciales (case-insensitive) sobre el índice configurado. Respeta paginación igual que `/items`.

### Widget embebido

- `GET /widget?apiOrigin=http://localhost:4100`: devuelve HTML mínimo que incrusta el cliente React para navegar colecciones.
- `GET /__widget__/client.js`: entrega el script (texto plano) que alimenta el widget.

## CollectionStore

Puedes interactuar directamente sin pasar por HTTP. Métodos clave:

- `initialize()`: prepara el directorio y limpia residuos previos.
- `createCollection({ name, indexField })`
- `addItem(name, payload)`, `getItem`, `updateItem`, `deleteItem`
- `listItems(name, { page, pageSize })`
- `searchItems(name, query, { page, pageSize })`
- `getCollectionSummaries()` devuelve los mismos datos que `GET /collections`.
- `getStorageStats()` expone límites y uso actual en bytes.

### Control de almacenamiento

Cada documento se guarda como archivo independiente (`<uuid>.json`). El store lleva la cuenta de los bytes totales y lanza `CollectionError` con estado `507` cuando se excede `maxStorageBytes` (10 MiB por defecto). Puedes ajustar el límite vía opciones del constructor.

### Manejo de errores

- Todas las validaciones de dominio lanzan `CollectionError` con un `status` HTTP sugerido.
- La capa HTTP transforma los errores en respuestas JSON `{ "message": "..." }`.
- `readRequestBody` limita el tamaño máximo del cuerpo a 1 MiB y requiere `Content-Type: application/json`.

## Datos de prueba

El directorio `sistemas/nosql-db/data/` se limpia al iniciar el servicio. Añade un `.gitkeep` si necesitas conservar la carpeta en repositorios nuevos.
