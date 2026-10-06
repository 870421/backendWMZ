# WeatherMapZ Backend - Decisions (PBI-3)

Decisions taken while importing urban data. Items under "Pending" are not resolved.

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

## Building height (`buildings.height_m`)

Order of preference (`src/domain/buildings/heightEstimation.js`):

1. `measured_height` → `height_source = 'measured'`, if it is plausible:
   2 m ≤ height ≤ 150 m and, when `storeys_above_ground` is known,
   2.5 m ≤ height / storeys ≤ 6 m.
2. Otherwise, if storeys are known: `storeys × 3 m + 1 m` → `'floors_estimate'`.
   The case is logged as a warning (it is not a rejection) and counted in `import_runs.details`.
3. Otherwise `4 m` → `'default'`.

All thresholds and constants are configurable with environment variables (`BUILDING_*` in
`src/config/importConfig.js`). The 4 m default equals one storey with the same formula; it is
provisional and only affected 3 buildings on 2026-10-06.

**Provenance of `measured_height`:** the layer states "Fuente: Catastro INSPIRE BU", but how the
height was measured is not documented by the service. It is stored as `'measured'` because values
are not a fixed multiple of the storeys (heights per storey range from 3 to 4.9 m with decimals).

## Trees

- Empty `ALTTOTAL`, `DIAMCOPA` or `ESPECIE` values are stored as `NULL`; trees are not rejected
  for missing attributes.
- **Pending (PBI-5.2):** crown diameter is empty for most trees (~82 % in a sample). It is **not**
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

## Pending

- **Tall single-storey buildings.** With the plausibility rule above, 3,690 buildings whose
  measured height exceeds 6 m per storey were replaced by `storeys × 3 + 1` (2,931 of them have
  one storey; median measured height 8.1 m, 90th percentile 18.1 m). In a 2,000-building sample,
  these cases include industrial (73), residential (85) and public-service (14) buildings. Many
  may be correct measurements (warehouses, churches, sports halls), in which case the rule
  underestimates their shadow. To be reviewed before PBI-5.
