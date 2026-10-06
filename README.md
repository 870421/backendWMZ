# WeatherMapZ Backend

Backend de WeatherMapZ con Node.js + Express.

## Requisitos

- Node.js 22 o superior
- npm
- Docker (para la base de datos PostgreSQL/PostGIS que usan los imports de datos urbanos)

## Instalación

```bash
npm install
cp .env.example .env      # después, rellena DB_PASSWORD y ORS_API_KEY
```

## Base de datos (PostGIS)

`docker-compose.yml` arranca `postgis/postgis:17-3.5` con un volumen persistente `pgdata`. En el
primer arranque también crea la base de datos de test (`DB_TEST_NAME`). Compose lee los valores
`DB_*` de `backend/.env`.

```bash
docker compose up -d db       # o: npm run db:up
npm run db:migrate            # base de datos de desarrollo
npm run db:migrate:test       # base de datos de test (los tests de integración también lo hacen solos)
```

Las migraciones están en `src/repositories/migrations` (sequelize-cli) y `npm run db:migrate`
aplica todas las pendientes, en orden:

| Migración | Crea |
| --- | --- |
| `20261006000001-enable-postgis` | extensión `postgis` |
| `20261006000002-create-import-tracking` | `import_runs`, `import_rejections` |
| `20261006000003-create-urban-elements` | `buildings`, `trees`, `street_segments` |
| `20261006000004-add-building-height-suspicious` | `buildings.height_suspicious` |

Una base de datos que ya tenía las tres primeras migraciones solo necesita volver a ejecutar
`npm run db:migrate`; la columna nueva se añade con `false` en las filas existentes y
`npm run import:buildings` la rellena.

Todas las geometrías se guardan en EPSG:4326 con índices GIST.

### Tabla `buildings`

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `id` | serial | Clave primaria |
| `source`, `source_id` | text | Origen (`idezar`) e `identifier` de IDEZAR; únicos en conjunto |
| `height_m` | double, not null | Altura usada para las sombras (ver ADR-001 en el `docs/DECISIONS.md` del workspace) |
| `height_source` | text | `measured`, `floors_estimate` o `default` |
| `height_suspicious` | boolean, por defecto `false` | Altura medida aceptada pero atípica, marcada para revisión |
| `floors` | smallint | `storeys_above_ground` (null si se desconoce o es 0) |
| `geom` | `geometry(MultiPolygon, 4326)` | Huella del edificio (índice GIST) |
| `import_run_id` | integer | Última ejecución de import que escribió la fila |

## Imports de datos urbanos (PBI-3.1)

Se ejecutan después de las migraciones, en este orden:

```bash
npm run import:all            # edificios, árboles y red peatonal (unos 20 minutos)
# o uno a uno:
npm run import:buildings      # IDEZAR citygml3d:building
npm run import:trees          # IDEZAR idezar_base:arboles_2022
npm run import:streets        # vías peatonales de OpenStreetMap vía Overpass, troceadas en tramos
```

Cada ejecución se guarda en `import_runs` con `source_count` (lo que anuncia la fuente),
`imported_count` y `rejected_count`. Cada registro rechazado se guarda con su motivo y sus datos
originales en `import_rejections`. Si importados + rechazados no coincide con el número de la
fuente, la ejecución queda en `mismatch` y el comando sale con código 1. Repetir un import
actualiza las filas existentes; nunca las duplica. Las fuentes, campos y licencias están en
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md), y las decisiones tomadas (altura de los edificios,
filtro de la red, troceo) en el [docs/DECISIONS.md](../docs/DECISIONS.md) del workspace (ADR-001 a
ADR-008, fuera de este repositorio).

### Atribución de los datos

Origen de los datos: Ayuntamiento de Zaragoza (IDEZAR), edificios: vigencia 2026-10-01;
arbolado: inventario 2022 (capa `arboles_2022`).

© OpenStreetMap contributors, ODbL.

## Desarrollo

```bash
npm run dev
```

La API se sirve en <http://localhost:3000/api>.

## Tests

```bash
npm test                      # tests unitarios y HTTP, sin base de datos
npm run test:integration      # tests con PostGIS; necesitan `docker compose up -d db`
npm run test:all              # ambos, con cobertura combinada
```

Los tests nunca llaman a APIs externas; las respuestas de IDEZAR y Overpass salen de fixtures en
`src/tests/fixtures`.

## Comprobaciones

```bash
npm run check
npm run lint                  # ESLint (airbnb-base + compatibilidad con Prettier)
npm run format:check          # Prettier
```

## Arranque en producción

```bash
npm start
```

## Variables de entorno

- `NODE_ENV`: entorno de ejecución.
- `PORT`: puerto HTTP. Valor local por defecto: `3000`.
- `CORS_ORIGIN`: origen permitido del frontend. Valor local por defecto: `http://localhost:5173`.
- `LOG_LEVEL`: `debug`, `info` (por defecto), `warn`, `error` o `silent` (por defecto en los tests).
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: conexión a PostgreSQL/PostGIS; también
  las usa `docker-compose.yml`. `DB_TEST_NAME`: nombre de la base de datos de test.
- `DATABASE_URL`, `TEST_DATABASE_URL`: cadenas de conexión opcionales que sustituyen a los valores `DB_*`.
- `IDEZAR_WFS_URL`, `OVERPASS_URL`: endpoints de las fuentes del import (valores por defecto en `src/config/importConfig.js`).
- `IMPORT_WFS_PAGE_SIZE` (2000), `IMPORT_BATCH_SIZE` (500): tamaño de página del import y de cada transacción.
- `BUILDING_FLOOR_HEIGHT_M` (3), `BUILDING_GROUND_FLOOR_EXTRA_M` (1), `BUILDING_DEFAULT_HEIGHT_M` (4),
  `BUILDING_MIN_HEIGHT_M` (2), `BUILDING_MAX_HEIGHT_M` (150), `BUILDING_MIN_HEIGHT_PER_FLOOR_M` (2),
  `BUILDING_MAX_HEIGHT_PER_FLOOR_M` (8), `BUILDING_MAX_SINGLE_STOREY_HEIGHT_M` (40),
  `BUILDING_SUSPICIOUS_SINGLE_STOREY_HEIGHT_M` (15), `BUILDING_SUSPICIOUS_HEIGHT_PER_FLOOR_M` (6):
  estimación de la altura de los edificios (ver ADR-001 en el `docs/DECISIONS.md` del workspace).
- `ORS_API_KEY`: clave de API de OpenRouteService / HeiGIT que usa el autocompletado. Guárdala solo en el `backend/.env` ignorado por Git o en el entorno del servidor. `OPENROUTESERVICE_API_KEY` sigue funcionando como alternativa para configuraciones antiguas.
- `OPENROUTESERVICE_GEOCODING_BASE_URL`: URL base de la API de geocodificación. Valor local por defecto: `https://api.heigit.org/pelias/v1`.

## Contrato del autocompletado (PBI-1)

`GET /api/geocoding/autocomplete?text=Plaza%20del%20Pilar&limit=5`

Devuelve `{ results: [{ id, label, lat, lng, source: "search" }] }`.
Un texto de menos de 3 caracteres devuelve una lista vacía; la longitud máxima es 200.
`limit` vale 5 por defecto y debe ser un entero de 1 a 10. Las consultas no válidas devuelven 400.
El adaptador valida, normaliza y elimina duplicados de los resultados del proveedor.
La búsqueda se centra en Zaragoza y filtra por España. No se limita al término municipal.

Los errores usan `{ error: { message } }`: 503 si falta configuración, 429 si se agota la cuota
del proveedor, 504 si el proveedor supera el timeout de 8 segundos y 502 si falla el proveedor o
la red, o la respuesta no es válida. Nunca se reenvían cuerpos de respuesta del proveedor ni
credenciales. Los tests automáticos simulan las peticiones externas.

Desde la raíz del workspace, `docker compose up` carga `backend/.env` mediante `env_file`.
Crea ese fichero (ignorado por Git) a partir de `.env.example` antes de arrancar Compose; no
sobrescribas una clave existente. El frontend llega a la API a través del proxy de desarrollo de
Vite.

## Checklist de verificación manual

### PBI-3.1 - Importación de edificios y arbolado

- [ ] `docker compose up -d db` y `npm run db:migrate` terminan sin errores y aplican las cuatro
      migraciones (`SELECT name FROM sequelize_meta;`). En una base de datos que ya tenía las tres
      primeras, `npm run db:migrate` solo añade `20261006000004-add-building-height-suspicious`.
- [ ] `npm run import:all` termina con `SUCCESS` en `buildings`, `trees` y `streets`, y con código
      de salida 0.
- [ ] Los conteos coinciden con la fuente:
      `SELECT dataset, source_count, imported_count, rejected_count, status FROM import_runs ORDER BY id DESC LIMIT 3;`
      Compara `source_count` con el `numberMatched` de
      `https://idezar-sig.zaragoza.es/servicios/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=citygml3d:building&resultType=hits`
      (y de `idezar_base:arboles_2022`).
- [ ] `SELECT count(*) FROM buildings;`, `trees` y `street_segments` coinciden con `imported_count`.
- [ ] Los rechazos son visibles: `SELECT dataset, reason, count(*) FROM import_rejections GROUP BY 1, 2;`
- [ ] Volver a ejecutar `npm run import:trees` no cambia `SELECT count(*) FROM trees;`.
- [ ] `SELECT height_source, count(*) FROM buildings GROUP BY 1;` → measured ≈ 38.712,
      floors_estimate ≈ 248, default ≈ 3 (valores del 2026-10-06; cambian un poco si se actualiza
      la fuente).
- [ ] `SELECT count(*) FROM buildings WHERE height_suspicious;` → ≈ 727.
- [ ] Un edificio de una planta con 12 m medidos conserva sus 12 m:
      `SELECT height_m, height_source, height_suspicious FROM buildings WHERE source_id = 'ES.SDGC.BU.1250607XM8015A07';`
      → `12 | measured | f`.
- [ ] Las alturas de una planta no se recortan:
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY height_m), percentile_cont(0.9) WITHIN GROUP (ORDER BY height_m) FROM buildings WHERE floors = 1;`
      → 4.6 y 7.8.
