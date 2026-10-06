# WeatherMapZ Backend - Decisiones

Este documento tiene dos partes:

1. **[Registro de PBIs](#registro-de-pbis)**: una entrada por PBI, de la más reciente a la más
   antigua. Explica qué se hizo, cómo se comprueba y qué queda pendiente.
2. **[Decisiones de arquitectura (ADR)](#decisiones-de-arquitectura-adr)**: cada decisión técnica
   no obvia, con su contexto y sus alternativas. Un ADR no se borra: si cambia, se marca como
   "Sustituido por ADR-00X".

La regla que obliga a mantenerlo está en `AGENTS.md` ("Documentación obligatoria por PBI").

## Índice

- Registro de PBIs
  - [PBI-3.1 — Importación de datos de edificios y arbolado](#pbi-31--importación-de-datos-de-edificios-y-arbolado)
- Decisiones de arquitectura (ADR)
  - [ADR-001 — Building height](#adr-001--building-height-buildingsheight_m)
  - [ADR-002 — Urban data sources](#adr-002--urban-data-sources)
  - [ADR-003 — Coordinate reference systems](#adr-003--coordinate-reference-systems)
  - [ADR-004 — WFS paging with sortBy](#adr-004--wfs-paging-with-sortby)
  - [ADR-005 — Pedestrian network from OpenStreetMap](#adr-005--pedestrian-network-from-openstreetmap)
  - [ADR-006 — Import reconciliation and idempotency](#adr-006--import-reconciliation-and-idempotency)
  - [ADR-007 — Database configuration and test database](#adr-007--database-configuration-and-test-database)
  - [ADR-008 — ESLint 9 with airbnb-base via FlatCompat](#adr-008--eslint-9-with-airbnb-base-via-flatcompat)

---

## Registro de PBIs

### PBI-3.1 — Importación de datos de edificios y arbolado

- **Fecha:** 2026-10-06
- **Rama:** `feature/pbi-3.1-importacion`
- **Estado:** En revisión

#### Qué se ha hecho

El backend ya tiene base de datos: PostgreSQL con PostGIS, que se arranca con Docker. Se han
cargado en ella todos los edificios de Zaragoza con su altura (38.963) y todos los árboles del
inventario municipal (172.543), descargados de la IDE del Ayuntamiento (IDEZAR). También se ha
cargado la red de calles por las que se puede andar, sacada de OpenStreetMap y partida en tramos
entre cruces (91.872 tramos), que la PBI-3.2 necesita para asociar edificios y árboles a cada calle.
Cada importación se puede repetir sin duplicar datos, guarda los registros que no se pueden
importar con el motivo, y comprueba que importados + rechazados coincide con lo que anuncia la
fuente. Si no coincide, falla. Las alturas se toman de la medición publicada y solo se corrigen
cuando son claramente erróneas ([ADR-001](#adr-001--building-height-buildingsheight_m)). Las
sombras todavía no se calculan.

#### Condiciones de satisfacción

- [x] **Se importan los edificios con su altura disponible para Zaragoza.** 38.963/38.963.
      Comprobación: `npm run import:buildings` y
      `SELECT height_source, count(*) FROM buildings GROUP BY 1;`. Tests:
      `src/tests/unit/heightEstimation.test.js`, `src/tests/unit/idezarMappers.test.js`.
- [x] **Se importa el arbolado disponible para Zaragoza.** 172.543/172.543.
      Comprobación: `npm run import:trees` y `SELECT count(*) FROM trees;`.
- [x] **Los datos quedan almacenados en la base de datos.** Tablas `buildings`, `trees` y
      `street_segments` (EPSG:4326, índices GIST). Test:
      `src/tests/integration/importPersistence.test.js` (upsert idempotente contra la BD de test).
- [x] **El proceso detecta e informa de los registros que no se pueden importar.**
      `SELECT dataset, reason, count(*) FROM import_rejections GROUP BY 1, 2;`. Tests:
      `src/tests/unit/importRunner.test.js` y los casos de geometría inválida en
      `importPersistence.test.js`.
- [x] **El número de elementos importados se puede contrastar con la fuente.**
      `SELECT dataset, source_count, imported_count, rejected_count, status FROM import_runs;`
      frente a `resultType=hits` del WFS. Si no cuadra, el run queda en `mismatch` y el comando
      sale con código 1 (`src/tests/unit/importCli.test.js`).

#### Datos y resultados reales (2026-10-06)

| Dataset | Fuente | Importados | Rechazados | Estado |
| --- | --- | --- | --- | --- |
| buildings | 38.963 | 38.963 (158 geometrías reparadas con `ST_MakeValid`) | 0 | success |
| trees | 172.543 | 172.543 | 0 | success |
| streets (vías OSM) | 44.676 | 44.596 → 91.872 tramos | 80 (`outside_zaragoza_bbox`) | success |

| Alturas de edificios | Regla anterior | Regla nueva (ADR-001) |
| --- | --- | --- |
| `measured` | 35.025 | 38.712 |
| `floors_estimate` | 3.935 | 248 |
| `default` | 3 | 3 |
| `height_suspicious` | (no existía) | 727 |
| Edificios de 1 planta (12.523): mediana / p90 de `height_m` | 4,0 / 5,3 m | 4,6 / 7,8 m |

Árboles con atributos vacíos (guardados como `NULL`): altura 15.545 (9,0 %), diámetro de copa
138.836 (80,5 %), especie 14.640 (8,5 %).

Duración aproximada: edificios 4 min, árboles 17 min, red peatonal 40 s. Reimportar edificios y
calles no cambia el número de filas.

#### Cambios técnicos

- **Infraestructura:** `docker-compose.yml` (`postgis/postgis:17-3.5`, volumen `pgdata`, crea la
  BD de test), sequelize-cli (`.sequelizerc`), ESLint + Prettier.
- **Migraciones:** `20261006000001-enable-postgis`, `20261006000002-create-import-tracking`
  (`import_runs`, `import_rejections`), `20261006000003-create-urban-elements` (`buildings`,
  `trees`, `street_segments`), `20261006000004-add-building-height-suspicious`.
- **Comandos npm:** `db:up`, `db:migrate`, `db:migrate:test`, `db:migrate:undo`,
  `import:buildings`, `import:trees`, `import:streets`, `import:all`, `test:integration`,
  `test:all`, `lint`, `lint:fix`, `format`, `format:check`.
- **Variables de entorno:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
  `DB_TEST_NAME`, `TEST_DATABASE_URL`, `LOG_LEVEL`, `IDEZAR_WFS_URL`, `OVERPASS_URL`,
  `IMPORT_WFS_PAGE_SIZE`, `IMPORT_BATCH_SIZE` y los umbrales `BUILDING_*` (lista en el README).
  `DATABASE_URL` sigue funcionando como alternativa.
- **Endpoints:** ninguno nuevo (llegan en la PBI-3.3).
- **Código:** `src/integrations/idezar` y `src/integrations/osm` (fuentes),
  `src/services/import` (orquestación), `src/domain/buildings` y `src/domain/geo` (reglas),
  `src/repositories` (modelos, migraciones y upsert en PostGIS).

#### Decisiones tomadas

- [ADR-001 — Building height](#adr-001--building-height-buildingsheight_m)
- [ADR-002 — Urban data sources](#adr-002--urban-data-sources)
- [ADR-003 — Coordinate reference systems](#adr-003--coordinate-reference-systems)
- [ADR-004 — WFS paging with sortBy](#adr-004--wfs-paging-with-sortby)
- [ADR-005 — Pedestrian network from OpenStreetMap](#adr-005--pedestrian-network-from-openstreetmap)
- [ADR-006 — Import reconciliation and idempotency](#adr-006--import-reconciliation-and-idempotency)
- [ADR-007 — Database configuration and test database](#adr-007--database-configuration-and-test-database)
- [ADR-008 — ESLint 9 with airbnb-base via FlatCompat](#adr-008--eslint-9-with-airbnb-base-via-flatcompat)

#### Pendiente y riesgos para siguientes PBIs

- **PBI-5.2:** el diámetro de copa falta en el 80,5 % de los árboles. Se guarda como `NULL` y no se
  estima; la forma de estimarlo se decide en la PBI-5.2.
- **PBI-3.2:** el 95 % de asociación se medirá sobre el tramo más cercano (sin límite de
  distancia). Las 80 vías que cruzan el borde del bbox se rechazaron, así que puede haber
  elementos del extremo del término municipal sin tramo cercano dentro de 150 m.
- **PBI-5:** 727 alturas tienen `height_suspicious = true`. Se usan tal cual en las sombras;
  quedan para revisión manual o contraste con otra fuente.
- **Procedencia de `measured_height`:** no está documentada por IDEZAR (ver ADR-001).
- **Antigüedad del arbolado:** la capa es el inventario de 2022.
- **Herramientas:** ESLint 9 ya no tiene soporte oficial (ver ADR-008).
- **Tests:** el aviso de Jest "A worker process has failed to exit gracefully" ya aparecía en
  `main` con los tests de la PBI-1; no lo introduce esta PBI.

#### Cómo verificarlo a mano

1. `cp .env.example .env` (pon una contraseña en `DB_PASSWORD`), `docker compose up -d db` y
   `npm run db:migrate`. `SELECT name FROM sequelize_meta;` devuelve las 4 migraciones.
2. Sobre una BD que ya tenía las tres primeras migraciones, `npm run db:migrate` solo aplica
   `20261006000004-add-building-height-suspicious`, y `height_suspicious` existe con valor `false`.
3. `npm run import:all` (unos 20 minutos): los tres datasets acaban en `SUCCESS` y el comando
   sale con código 0.
4. `SELECT dataset, source_count, imported_count, rejected_count, status FROM import_runs ORDER BY id DESC LIMIT 3;`
   y comparar `source_count` con `resultType=hits` del WFS (URLs en el README).
5. `SELECT dataset, reason, count(*) FROM import_rejections GROUP BY 1, 2;` → 80 `outside_zaragoza_bbox` en `streets`.
6. `SELECT height_source, count(*) FROM buildings GROUP BY 1;` → measured ≈ 38.712,
   floors_estimate ≈ 248, default ≈ 3.
7. `SELECT count(*) FROM buildings WHERE height_suspicious;` → ≈ 727.
8. `SELECT height_m, height_source, height_suspicious FROM buildings WHERE source_id = 'ES.SDGC.BU.1250607XM8015A07';`
   → `12 | measured | f` (un edificio de una planta con 12 m medidos conserva 12 m).
9. Repetir `npm run import:trees` y comprobar que `SELECT count(*) FROM trees;` no cambia.
10. `npm run lint`, `npm run format:check` y `npm run test:all` (con la BD levantada) en verde.

---

## Decisiones de arquitectura (ADR)

Formato: Context / Decision / Alternatives discarded / Consequences. Estados posibles: Accepted,
Superseded by ADR-00X.

### ADR-001 — Building height (`buildings.height_m`)

- **Date:** 2026-10-06
- **Status:** Accepted (replaces the first PBI-3.1 rule) · **PBI:** 3.1
- **Code:** `src/domain/buildings/heightEstimation.js`; thresholds in `importConfig.height`
  (`src/config/importConfig.js`), each overridable with a `BUILDING_*` environment variable.

#### Context

Buildings come from IDEZAR `citygml3d:building`, which provides `measured_height` (metres) and
`storeys_above_ground` for each footprint. The layer states "Fuente: Catastro INSPIRE BU", but the
service does not document how the height was measured. Values do not look derived from the storey
count (they have decimals and vary from about 3 to 4.9 m per storey in ordinary blocks), so they
are treated as measurements. Shadow calculations (PBI-5) depend directly on `height_m`.

#### Problem detected

The first rule accepted a measured height only between 2.5 and 6 m per storey and otherwise
replaced it with `storeys × 3 + 1`. On the real data it replaced 3,690 measured heights, 2,931 of
them in single-storey buildings (median measured height 8.1 m, 90th percentile 18 m). Tall
single-storey buildings are expected (warehouses, churches, sports halls); a 2,000-building
sample of the replaced cases contained 73 industrial, 85 residential and 14 public-service
buildings. Cutting them to 4 m made their shadows shorter than in reality.

#### Decision

The measured height is the main source. It is replaced only when it is clearly wrong. All limits
are inclusive: a value equal to a limit is accepted.

| Constant (`importConfig.height`) | Value | Rule | Justification |
| --- | --- | --- | --- |
| `minHeightM` | 2 m | height < 2 m → wrong | Lower than any usable floor. |
| `maxHeightM` | 150 m | height > 150 m → wrong | The tallest accepted measured height in the data is 100.5 m. |
| `minHeightPerFloorM` | 2 m/storey | 2+ storeys and height / storeys < 2 → wrong | Storeys cannot be lower than about 2 m. |
| `maxHeightPerFloorM` | 8 m/storey | 2+ storeys and height / storeys > 8 → wrong | Above this, storeys and height contradict each other. |
| `maxSingleStoreyHeightM` | 40 m | 1 storey (or unknown) and height > 40 m → wrong | Allows warehouses, churches and sports halls; higher values are not single-storey buildings. |
| `floorHeightM` | 3 m | replacement = storeys × 3 + 1 | Typical storey height. |
| `groundFloorExtraM` | 1 m | (the "+ 1") | Taller ground floor and roof. |
| `defaultHeightM` | 4 m | neither a valid height nor storeys | Same as one storey with the formula. |
| `suspiciousSingleStoreyHeightM` | 15 m | 1 storey (or unknown) and height > 15 m → suspicious | Rare but possible; worth a manual look. |
| `suspiciousHeightPerFloorM` | 6 m/storey | 2+ storeys and height / storeys > 6 → suspicious | Above usual storey heights, below the error limit. |

Result per building (`height_source`):

- `measured`: the measured height is accepted.
- `floors_estimate`: the measured height is missing or wrong and storeys are known. The case is
  logged as a warning (it is not a rejection) and counted in `import_runs.details`.
- `default`: neither a usable height nor storeys (3 buildings).

`storeys_above_ground = 0` is treated as unknown.

#### `height_suspicious`

Boolean column (default `false`, added by migration `20261006000004`). It is `true` for accepted
measured heights that are atypical: one storey (or unknown) and more than 15 m, or more than 6 m
per storey. It only marks the value; `height_m` is never changed because of it. It is meant for
manual review or for checking against future sources (e.g. LiDAR) without altering calculations.

#### Impact (real data, 2026-10-06, 38,963 buildings)

| `height_source` | Previous rule | New rule |
| --- | --- | --- |
| `measured` | 35,025 | 38,712 |
| `floors_estimate` | 3,935 | 248 |
| `default` | 3 | 3 |
| `height_suspicious = true` | (did not exist) | 727 (152 single-storey > 15 m, 575 > 6 m/storey) |
| Single-storey buildings (12,523): median `height_m` | 4.0 m | 4.6 m |
| Single-storey buildings: 90th percentile `height_m` | 5.3 m | 7.8 m |

Reasons for the 248 `floors_estimate` cases: 184 above 8 m/storey, 46 below 2 m/storey, 7 above
150 m, 6 single-storey above 40 m, 5 below 2 m.

#### Alternatives discarded

- **First rule (2.5–6 m per storey for every building).** It treated tall single-storey buildings
  as errors and replaced 3,690 measured values with estimates, shortening their shadows.
- **Correcting suspicious heights automatically.** There is no second source to decide which
  value is right, so suspicious values are only flagged.

#### Consequences

- PBI-5.2 (shadows) uses `height_m` as stored. `height_suspicious` is not used in the shadow
  calculation.
- Changing a threshold only requires changing `importConfig.height` (or its environment variable)
  and running `npm run import:buildings` again.

### ADR-002 — Urban data sources

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Context.** PBI-3 needs building footprints with height, trees and a pedestrian network for the
municipality of Zaragoza. Endpoints, counts and fields are in DATA_SOURCES.md.

**Decision.** Buildings: IDEZAR `citygml3d:building`. Trees: IDEZAR `idezar_base:arboles_2022`.
Pedestrian network: OpenStreetMap through Overpass (ADR-005). Empty tree attributes are stored as
`NULL`; trees are not rejected for them. Crown diameter is not estimated (deferred to PBI-5.2).

**Alternatives discarded.**
- `urbanismo:Alturas_Edificios`: label points, not polygons; the meaning of `etiqueta` is unverified.
- Catastro INSPIRE WFS: limited to 4 km² per request, and IDEZAR already publishes its footprints.
- OSM buildings and trees: 25 of 18,137 buildings with `height`; 4,482 trees.
- `idezar_base:arboles_urbanismo` (map symbols) and `infraestructuraverde:reposicion` (replacements).
- `idezar.zaragoza.es/geoserver`: a different server without buildings or trees.

**Consequences.** Data must carry the attribution in DATA_SOURCES.md. Heights depend on the
undocumented provenance of `measured_height` (ADR-001).

### ADR-003 — Coordinate reference systems

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Context.** IDEZAR serves EPSG:25830, OSM and the frontend (Leaflet) use WGS84, and later PBIs
need distances in metres.

**Decision.** All geometries are stored in EPSG:4326 with GIST indexes. Distances and lengths are
computed with `geography` or after `ST_Transform(geom, 25830)` (ETRS89 / UTM 30N), never in
degrees. `street_segments.length_m` is `ST_Length(geom::geography)`. Validation uses the extent
IDEZAR publishes for the municipality (lng −1.1862 to −0.6850, lat 41.4518 to 41.8103); a feature
is rejected when any vertex falls outside it.

**Alternatives discarded.** Storing in EPSG:25830: metric operations become simpler, but every
response to the frontend and every OSM import would need a transformation.

**Consequences.** Spatial queries in PBI-3.2 and later must cast to `geography` or transform to
25830 when they measure distances.

### ADR-004 — WFS paging with sortBy

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Context.** The layers have up to 172,543 features and are downloaded in pages
(`startIndex`/`count`).

**Decision.** Every page request includes `sortBy` on the layer identifier (`identifier` for
buildings, `ID` for trees). The source count is `numberMatched` from the first page.

**Alternatives discarded.** Paging without `sortBy`: GeoServer does not guarantee a stable order,
so features could be repeated or skipped between pages without any error.

**Consequences.** Requests are slower (about 10 s per 2,000 features), but duplicated identifiers
would surface as `duplicate_source_id` rejections.

### ADR-005 — Pedestrian network from OpenStreetMap

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Context.** PBI-3.2 associates buildings and trees with street segments, so a walkable network
covering the whole municipality is needed.

**Decision.** Overpass query inside the administrative area `ref:ine` 50297, with `highway` in
footway, pedestrian, path, steps, living_street, residential, service, tertiary, secondary,
primary, unclassified, cycleway and **track**, excluding `foot=no` and `access=private`. Ways are
split at OSM nodes shared by two or more ways (or used twice by the same way); junctions are found
in JavaScript by node id, which is exact and linear in time. `source_id` is
`<osm_way_id>:<sequence>`. Ways crossing the bbox edge are rejected, not clipped. The source count
is the number of ways in the Overpass response.

**Alternatives discarded.**
- IDEZAR `urbanismo:Vias`: not evaluated for walkability tags; OSM provides `foot`/`access`.
- Without `track`: rural buildings and trees would have no nearby segment.
- Re-noding geometries in PostGIS (`ST_Node`): would also split at bridges and tunnels where ways
  cross without a shared node.

**Consequences.** Network quality depends on OSM. 80 ways at the municipal edge are rejected.

### ADR-006 — Import reconciliation and idempotency

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Context.** Imports must not lose records silently, must be comparable with the source and must
be repeatable.

**Decision.**
- Upsert by `(source, source_id)` in transactions of `IMPORT_BATCH_SIZE` (500) records. If a
  batch fails, records are retried one by one to isolate the faulty ones.
- Invalid polygons are repaired with `ST_MakeValid`; if no polygon remains, the record is rejected
  as `invalid_geometry`. Every rejection is stored in `import_rejections` with the raw record.
- A run is `success` only if imported + rejected equals the source count; otherwise `mismatch`
  (exit code 1). Network or server errors leave it `failed`.
- Each row stores the `import_run_id` that last wrote it. After a `success` run, rows of the same
  source not written by it are deleted; after a `mismatch` they are kept.

**Alternatives discarded.** Truncating and reloading each table: simpler, but it would change the
ids that PBI-3.2 associations reference.

**Consequences.** Re-running imports is safe. Street segment ids stay stable while OSM does not
change.

### ADR-007 — Database configuration and test database

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Decision.** The connection is built from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and
`DB_PASSWORD`, the same variables used by `docker-compose.yml`. `DATABASE_URL` and
`TEST_DATABASE_URL` remain optional overrides (managed databases). Integration tests use a
separate database (`DB_TEST_NAME`), migrated automatically; `npm test` needs no database.

**Alternatives discarded.** Only `DATABASE_URL`: Compose would need the same data duplicated in
another format. Testcontainers: adds a dependency and slower test start-up.

**Consequences.** `npm run test:integration` and `npm run test:all` need `docker compose up -d db`.

### ADR-008 — ESLint 9 with airbnb-base via FlatCompat

- **Date:** 2026-10-06 · **Status:** Accepted · **PBI:** 3.1

**Context.** The team's definition of done requires ESLint with airbnb-base and Prettier.
`eslint-config-airbnb-base` 15 only supports the legacy configuration and declares ESLint ≤ 8 as
its peer dependency.

**Decision.** ESLint 9 with `eslint.config.js`, loading airbnb-base through `FlatCompat`, plus
`eslint-config-prettier`. An npm `overrides` entry lets airbnb-base accept ESLint 9. Prettier
ignores Markdown (it broke the arrow diagrams in `AGENTS.md`).

**Alternatives discarded.** ESLint 8 (legacy config, end of life); `--legacy-peer-deps` in
`.npmrc` (relaxes peer checks for every package).

**Consequences.** npm warns that ESLint 9 is no longer supported; moving to ESLint 10 may require
replacing airbnb-base with a configuration that supports flat config natively.
