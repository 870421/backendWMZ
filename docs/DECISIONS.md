# WeatherMapZ Backend - Decisions (PBI-3)

Decisions taken while importing urban data. Items marked "Pending" are not resolved.

## Data sources

- **Buildings** come from IDEZAR `citygml3d:building` (Catastro-derived footprints with height
  and storeys). OSM and the Catastro WFS were evaluated and discarded; see DATA_SOURCES.md.
- **Trees** come from IDEZAR `idezar_base:arboles_2022`.
- **Pedestrian network** comes from OpenStreetMap through Overpass.
- `urbanismo:Alturas_Edificios` is **not** used. It contains label points, not building
  polygons, and the meaning of `etiqueta` remains unverified.

## Storage and coordinates

- All geometries are stored in EPSG:4326 with GIST indexes. Distances must be computed with
  `geography` or after `ST_Transform(geom, 25830)` (ETRS89 / UTM 30N), never in degrees.
- `street_segments.length_m` is `ST_Length(geom::geography)`.
- The Zaragoza bbox used for validation is the extent IDEZAR publishes for the municipality
  (lng −1.1862 to −0.6850, lat 41.4518 to 41.8103). A feature is rejected when any vertex falls
  outside it.

## Building height (`buildings.height_m`) — ADR-001

- **Date:** 2026-10-06
- **Status:** Accepted (replaces the first PBI-3.1 rule)
- **Code:** `src/domain/buildings/heightEstimation.js`; thresholds in `importConfig.height`
  (`src/config/importConfig.js`), each overridable with a `BUILDING_*` environment variable.

### Context

Buildings come from IDEZAR `citygml3d:building`, which provides `measured_height` (metres) and
`storeys_above_ground` for each footprint. The layer states "Fuente: Catastro INSPIRE BU", but the
service does not document how the height was measured. Values do not look derived from the storey
count (they have decimals and vary from about 3 to 4.9 m per storey in ordinary blocks), so they
are treated as measurements. Shadow calculations (PBI-5) depend directly on `height_m`.

### Problem detected

The first rule accepted a measured height only between 2.5 and 6 m per storey and otherwise
replaced it with `storeys × 3 + 1`. On the real data it replaced 3,690 measured heights, 2,931 of
them in single-storey buildings (median measured height 8.1 m, 90th percentile 18 m). Tall
single-storey buildings are expected (warehouses, churches, sports halls); a 2,000-building
sample of the replaced cases contained 73 industrial, 85 residential and 14 public-service
buildings. Cutting them to 4 m made their shadows shorter than in reality.

### Decision

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

### `height_suspicious`

Boolean column (default `false`, added by migration `20261006000004`). It is `true` for accepted
measured heights that are atypical: one storey (or unknown) and more than 15 m, or more than 6 m
per storey. It only marks the value; `height_m` is never changed because of it. It is meant for
manual review or for checking against future sources (e.g. LiDAR) without altering calculations.

### Impact (real data, 2026-10-06, 38,963 buildings)

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

### Alternatives discarded

- **First rule (2.5–6 m per storey for every building).** It treated tall single-storey buildings
  as errors and replaced 3,690 measured values with estimates, shortening their shadows.
- **Correcting suspicious heights automatically.** There is no second source to decide which
  value is right, so suspicious values are only flagged.

### Consequences

- PBI-5.2 (shadows) uses `height_m` as stored. `height_suspicious` is not used in the shadow
  calculation.
- Changing a threshold only requires changing `importConfig.height` (or its environment variable)
  and running `npm run import:buildings` again.

## Trees

- Empty `ALTTOTAL`, `DIAMCOPA` or `ESPECIE` values are stored as `NULL`; trees are not rejected
  for missing attributes.
- **Pending (PBI-5.2):** crown diameter is empty for 138,836 of 172,543 trees (80.5 %). It is **not**
  estimated in PBI-3; how to estimate it is decided in PBI-5.2.

## Pedestrian network

- `highway=track` is included (with `foot!=no`), so rural buildings and trees can reach a
  segment in PBI-3.2.
- Ways are split into segments at OSM nodes shared by two or more ways (or visited twice by
  the same way). Junctions are detected in JavaScript by OSM node id, which is exact and linear
  in time, instead of re-noding geometries in PostGIS. Segments without length (consecutive
  duplicate nodes) are skipped and counted in the run details.
- `street_segments.source_id` is `<osm_way_id>:<sequence>`.
- Ways crossing the bbox edge are rejected (`outside_zaragoza_bbox`) rather than clipped.

## Import behaviour

- Imports are idempotent: upsert by `(source, source_id)`, in transactions of
  `IMPORT_BATCH_SIZE` (500) records.
- Invalid polygons are repaired with `ST_MakeValid`; if no polygon remains, the record is
  rejected as `invalid_geometry`. Rejections are stored in `import_rejections` with the raw
  source record; nothing is dropped silently.
- A run is `success` only if `imported + rejected = source_count`. Otherwise it is `mismatch`
  and the command exits with code 1. A failed request leaves the run as `failed`.
- Each row stores the `import_run_id` that last wrote it. After a **successful** run, rows of the
  same source not written by that run (no longer in the source) are deleted. After a mismatch,
  existing rows are kept.
