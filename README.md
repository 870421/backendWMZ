# WeatherMapZ Backend

Node.js + Express backend for WeatherMapZ.

## Requirements

- Node.js 22 or newer
- npm
- Docker (for the PostgreSQL/PostGIS database used by the urban-data imports)

## Setup

```bash
npm install
cp .env.example .env      # then set DB_PASSWORD and ORS_API_KEY
```

## Database (PostGIS)

`docker-compose.yml` starts `postgis/postgis:17-3.5` with a persistent `pgdata` volume. On first
start it also creates the test database (`DB_TEST_NAME`). Compose reads the `DB_*` values from
`backend/.env`.

```bash
docker compose up -d db       # or: npm run db:up
npm run db:migrate            # development database
npm run db:migrate:test       # test database (also done automatically by integration tests)
```

Migrations live in `src/repositories/migrations` (sequelize-cli) and `npm run db:migrate` applies
all pending ones, in order:

| Migration | Creates |
| --- | --- |
| `20261006000001-enable-postgis` | `postgis` extension |
| `20261006000002-create-import-tracking` | `import_runs`, `import_rejections` |
| `20261006000003-create-urban-elements` | `buildings`, `trees`, `street_segments` |
| `20261006000004-add-building-height-suspicious` | `buildings.height_suspicious` |

A database that already had the first three migrations only needs `npm run db:migrate` again; the
new column is added with `false` for existing rows, and `npm run import:buildings` fills it.

All geometries are stored in EPSG:4326 with GIST indexes.

### Table `buildings`

| Column | Type | Description |
| --- | --- | --- |
| `id` | serial | Primary key |
| `source`, `source_id` | text | Origin (`idezar`) and IDEZAR `identifier`; unique together |
| `height_m` | double, not null | Height used for shadows (see docs/DECISIONS.md, ADR-001) |
| `height_source` | text | `measured`, `floors_estimate` or `default` |
| `height_suspicious` | boolean, default `false` | Accepted but atypical measured height, flagged for review |
| `floors` | smallint | `storeys_above_ground` (null if unknown or 0) |
| `geom` | `geometry(MultiPolygon, 4326)` | Footprint (GIST index) |
| `import_run_id` | integer | Last import run that wrote the row |

## Urban data imports (PBI-3.1)

Run after the migrations, in this order:

```bash
npm run import:all            # buildings, trees and pedestrian network (about 20 minutes)
# or one by one:
npm run import:buildings      # IDEZAR citygml3d:building
npm run import:trees          # IDEZAR idezar_base:arboles_2022
npm run import:streets        # OpenStreetMap pedestrian ways via Overpass, split into segments
```

Each run is stored in `import_runs` with `source_count` (what the source announces),
`imported_count` and `rejected_count`. Every rejected record is stored with its reason and raw
data in `import_rejections`. If imported + rejected differs from the source count, the run is
`mismatch` and the command exits with code 1. Re-running an import updates rows in place; it
never duplicates them. Sources, fields and licences are documented in
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md), and the decisions taken (building height, network
filter, segmentation) in [docs/DECISIONS.md](docs/DECISIONS.md).

### Data attribution

Origen de los datos: Ayuntamiento de Zaragoza (IDEZAR), edificios: vigencia 2026-10-01;
arbolado: inventario 2022 (capa `arboles_2022`).

© OpenStreetMap contributors, ODbL.

## Development

```bash
npm run dev
```

The API runs on <http://localhost:3000/api>.

## Test

```bash
npm test                      # unit and HTTP tests, no database needed
npm run test:integration      # PostGIS tests; needs `docker compose up -d db`
npm run test:all              # both, with combined coverage
```

Tests never call external APIs; IDEZAR and Overpass responses come from fixtures in
`src/tests/fixtures`.

## Checks

```bash
npm run check
npm run lint                  # ESLint (airbnb-base + Prettier compatibility)
npm run format:check          # Prettier
```

## Production Start

```bash
npm start
```

## Environment

- `NODE_ENV`: runtime environment.
- `PORT`: HTTP port. Default local value: `3000`.
- `CORS_ORIGIN`: allowed frontend origin. Default local value: `http://localhost:5173`.
- `LOG_LEVEL`: `debug`, `info` (default), `warn`, `error` or `silent` (default in tests).
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: PostgreSQL/PostGIS connection, also
  used by `docker-compose.yml`. `DB_TEST_NAME`: test database name.
- `DATABASE_URL`, `TEST_DATABASE_URL`: optional connection strings that override the `DB_*` values.
- `IDEZAR_WFS_URL`, `OVERPASS_URL`: import source endpoints (defaults in `src/config/importConfig.js`).
- `IMPORT_WFS_PAGE_SIZE` (2000), `IMPORT_BATCH_SIZE` (500): import paging and transaction size.
- `BUILDING_FLOOR_HEIGHT_M` (3), `BUILDING_GROUND_FLOOR_EXTRA_M` (1), `BUILDING_DEFAULT_HEIGHT_M` (4),
  `BUILDING_MIN_HEIGHT_M` (2), `BUILDING_MAX_HEIGHT_M` (150), `BUILDING_MIN_HEIGHT_PER_FLOOR_M` (2),
  `BUILDING_MAX_HEIGHT_PER_FLOOR_M` (8), `BUILDING_MAX_SINGLE_STOREY_HEIGHT_M` (40),
  `BUILDING_SUSPICIOUS_SINGLE_STOREY_HEIGHT_M` (15), `BUILDING_SUSPICIOUS_HEIGHT_PER_FLOOR_M` (6): building height
  estimation (see docs/DECISIONS.md).
- `ORS_API_KEY`: OpenRouteService / HeiGIT API key used by geocoding autocomplete. Keep it only in the ignored `backend/.env` or server environment. `OPENROUTESERVICE_API_KEY` remains a fallback for older setups.
- `OPENROUTESERVICE_GEOCODING_BASE_URL`: geocoding API base URL. Default local value: `https://api.heigit.org/pelias/v1`.

## PBI-1 autocomplete contract

`GET /api/geocoding/autocomplete?text=Plaza%20del%20Pilar&limit=5`

Returns `{ results: [{ id, label, lat, lng, source: "search" }] }`.
Text shorter than 3 characters returns an empty list; maximum length is 200.
Limit defaults to 5 and must be an integer from 1 to 10. Invalid queries return 400.
Provider features are validated, normalized and deduplicated by the adapter.
Search uses Zaragoza focus and a Spain filter. It does not enforce a city boundary.

Errors use `{ error: { message } }`: 503 for missing configuration, 429 for provider
quota limits, 504 for the 8-second provider timeout, and 502 for provider/network or
invalid-response failures. Provider bodies and credentials are never forwarded.
Automated tests mock external requests.

From the workspace root, `docker compose up` loads `backend/.env` using `env_file`.
Create that ignored file from `.env.example` before starting Compose; do not overwrite
an existing key. The frontend reaches the API through Vite's development proxy.

## Manual verification checklist

### PBI-3.1 - Import of buildings and trees

- [ ] `docker compose up -d db` and `npm run db:migrate` finish without errors and apply the four
      migrations (`SELECT name FROM sequelize_meta;`). On a database that already had the first
      three, `npm run db:migrate` adds only `20261006000004-add-building-height-suspicious`.
- [ ] `npm run import:all` ends with `SUCCESS` for `buildings`, `trees` and `streets`, and exit
      code 0.
- [ ] Counts match the source:
      `SELECT dataset, source_count, imported_count, rejected_count, status FROM import_runs ORDER BY id DESC LIMIT 3;`
      Compare `source_count` with `numberMatched` from
      `https://idezar-sig.zaragoza.es/servicios/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=citygml3d:building&resultType=hits`
      (and `idezar_base:arboles_2022`).
- [ ] `SELECT count(*) FROM buildings;`, `trees` and `street_segments` match `imported_count`.
- [ ] Rejections are visible: `SELECT dataset, reason, count(*) FROM import_rejections GROUP BY 1, 2;`
- [ ] Running `npm run import:trees` again does not change `SELECT count(*) FROM trees;`.
- [ ] `SELECT height_source, count(*) FROM buildings GROUP BY 1;` → measured ≈ 38,712,
      floors_estimate ≈ 248, default ≈ 3 (values of 2026-10-06; they change slightly if the source
      is updated).
- [ ] `SELECT count(*) FROM buildings WHERE height_suspicious;` → ≈ 727.
- [ ] A single-storey building with 12 m measured keeps 12 m:
      `SELECT height_m, height_source, height_suspicious FROM buildings WHERE source_id = 'ES.SDGC.BU.1250607XM8015A07';`
      → `12 | measured | f`.
- [ ] Single-storey heights are not cut:
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY height_m), percentile_cont(0.9) WITHIN GROUP (ORDER BY height_m) FROM buildings WHERE floors = 1;`
      → 4.6 and 7.8.
