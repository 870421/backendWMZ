# WeatherMapZ Backend - Data Sources

Sources used by the PBI-3 imports (`npm run import:all`). Endpoints, counts and fields were
verified against the live services on 2026-10-06. Re-check them before relying on these numbers.

## Attribution (mandatory)

Any product or document that shows these data must include:

- "Origen de los datos: Ayuntamiento de Zaragoza (IDEZAR), edificios: vigencia 2026-10-01;
  arbolado: inventario 2022 (capa `arboles_2022`)"
- "© OpenStreetMap contributors, ODbL"

## Summary

| Dataset | Source | Layer / query | Elements (source) | Native CRS | Licence |
| --- | --- | --- | --- | --- | --- |
| Buildings | IDEZAR WFS | `citygml3d:building` | 38,963 | EPSG:25830 | Ayuntamiento de Zaragoza reuse conditions |
| Trees | IDEZAR WFS | `idezar_base:arboles_2022` | 172,543 | EPSG:25830 | Ayuntamiento de Zaragoza reuse conditions |
| Pedestrian network | OpenStreetMap (Overpass API) | walkable `highway` ways in the municipality | see `import_runs` (≈41,000 ways) | EPSG:4326 | ODbL 1.0 |

All imports request or receive WGS84 coordinates and store them in EPSG:4326.

## IDEZAR WFS (Ayuntamiento de Zaragoza)

- Endpoint: `https://idezar-sig.zaragoza.es/servicios/geoserver/wfs` (GeoServer, WFS 2.0.0).
  Capabilities report `Fees: NONE` and `AccessConstraints: NONE`; no API key is needed.
- Output used: `outputFormat=application/json`, `srsName=EPSG:4326`.
- Paging: `startIndex`/`count` with `sortBy` on the layer identifier (`ImplementsResultPaging`
  is `TRUE`; `CountDefault` is 1,000,000). The first page's `numberMatched` is the source count.
- Reuse conditions: the catalogue links to the City Council's legal notice. They are not a
  standard licence; they allow commercial and non-commercial reuse provided that the source is
  cited ("Origen de los datos: Ayuntamiento de Zaragoza"), the last update date is mentioned,
  the meaning of the data is not distorted and no municipal endorsement is implied.

Note: `https://idezar.zaragoza.es/geoserver` is a different GeoServer that only publishes noise
and density layers. It does not contain buildings or trees.

### Buildings: `citygml3d:building`

Layer abstract: "Huellas 2D de edificaciones con atributos urbanísticos (ref. catastral,
plantas, altura, uso, año). Fuente: Catastro INSPIRE BU. EPSG:25830."

| Field | Use |
| --- | --- |
| `identifier` (e.g. `ES.SDGC.BU.3512704XM8231D01`) | `buildings.source_id`, paging order |
| `measured_height` (decimal, m) | `height_m` when plausible (see DECISIONS.md) |
| `storeys_above_ground` (short) | `floors`; fallback height estimate |
| geometry (`Polygon` / `MultiPolygon`) | `geom`, stored as `MultiPolygon` |
| `cadastral_reference`, `function`, `year_of_construction`, `num_viviendas`, `vigencia` | not imported yet |

`vigencia` was `2026-10-01` in every feature sampled. How `measured_height` was obtained is not
documented by the service (see DECISIONS.md).

### Trees: `idezar_base:arboles_2022`

| Field | Use |
| --- | --- |
| `ID` (string) | `trees.source_id`, paging order |
| `ESPECIE` | `species` (null when empty) |
| `ALTTOTAL` (string, m) | `height_m` (null when empty; ~3 % in a 5,000 sample) |
| `DIAMCOPA` (string, m) | `crown_diameter_m` (null when empty; ~82 % in a 5,000 sample) |
| geometry (`Point`) | `geom` |
| `EDADREL`, `FECHAPLANT`, `MATRICULA` | not imported |

## OpenStreetMap via Overpass

- Endpoint: `https://overpass-api.de/api/interpreter` (configurable with `OVERPASS_URL`).
- Area: `boundary=administrative`, `admin_level=8`, `ref:ine` starting with `50297` (Zaragoza).
- Ways: `highway` in footway, pedestrian, path, steps, living_street, residential, service,
  tertiary, secondary, primary, unclassified, cycleway, track; excluding `foot=no` and
  `access=private`. The query is built in `src/integrations/osm/streetNetwork.js`.
- Source count: number of ways in the Overpass response (Overpass returns the whole result in
  one response; there is no separate `numberMatched`).
- Licence: Open Database License (ODbL) 1.0. Attribution "© OpenStreetMap contributors".

## Sources evaluated and not used

| Source | Result |
| --- | --- |
| `urbanismo:Alturas_Edificios` (IDEZAR) | 179,690 **points** with a text label (`etiqueta`, e.g. `ZV`). No building polygons; the label meaning is still unverified, so it is not used. |
| Catastro INSPIRE WFS (`ovc.catastro.meh.es/INSPIRE/wfsBU.aspx`) | Works and has `numberOfFloorsAboveGround`, but is limited to 4 km² per request (a 500 m square returned 4.7 MB). IDEZAR already publishes Catastro-derived footprints with heights. |
| OSM buildings / trees | 18,137 buildings, only 25 with `height`; 4,482 `natural=tree` nodes. Far less complete than IDEZAR. |
| `idezar_base:arboles_urbanismo` | 233,995 cartographic symbols (`TXT_LABEL`, colour, angle); no tree attributes. |
| `infraestructuraverde:reposicion` | Tree replacement works, not the tree inventory. |
