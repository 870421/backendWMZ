const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');
const { shadowConfig } = require('../config/shadowConfig');
const { withStatementTimeout } = require('./statementTimeout');

const ROUTE_CORRIDOR_M = 5;
const MIN_SEGMENT_OVERLAP_RATIO = 0.5;

function validateRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new TypeError('routes must be a non-empty array');
  }
  routes.forEach((route) => {
    if (
      !Number.isInteger(route.routeIndex) ||
      route.routeIndex < 0 ||
      route.geometry?.type !== 'LineString' ||
      !Array.isArray(route.geometry.coordinates) ||
      route.geometry.coordinates.length < 2
    ) {
      throw new TypeError('each route must contain a routeIndex and a LineString geometry');
    }
  });
}

/**
 * Associates ORS route geometries with the local OSM pedestrian segments in one PostGIS query.
 * Segments merely crossing the route corridor are rejected by the minimum overlap ratio.
 *
 * The route is searched piece by piece (ST_DumpSegments): the GIST index then only returns
 * segments near each straight piece. Searching with the whole route used the bounding box of the
 * entire route, so a 3.7 km diagonal route measured 7,328 candidates against the full line to
 * keep 367 (8.6 s locally; ADR-016).
 */
async function findSegmentsForRoutes(routes) {
  validateRoutes(routes);
  const serializedRoutes = JSON.stringify(
    routes.map(({ routeIndex, geometry }) => ({ routeIndex, geometry }))
  );

  // Same time limit as the shadow query: both run for every shaded-route request (ADR-015).
  return withStatementTimeout(shadowConfig.queryTimeoutMs, (transaction) =>
    sequelize.query(
      `WITH input_routes AS (
       SELECT (item->>'routeIndex')::integer AS route_index,
         ST_SetSRID(ST_GeomFromGeoJSON((item->'geometry')::text), 4326) AS route_geom
       FROM jsonb_array_elements(CAST(:routes AS jsonb)) AS entries(item)
     ), routes AS (
       SELECT route_index, route_geom,
         ST_Buffer(ST_Transform(route_geom, 25830), :corridorM) AS corridor_m
       FROM input_routes
     ), route_pieces AS (
       SELECT route_index, (ST_DumpSegments(route_geom)).geom AS piece
       FROM routes
     ), candidates AS (
       SELECT DISTINCT p.route_index, s.id AS segment_id
       FROM route_pieces p
       JOIN street_segments s ON ST_DWithin(s.geom::geography, p.piece::geography, :corridorM)
       WHERE ST_IsValid(s.geom) AND NOT ST_IsEmpty(s.geom)
     ), measured_overlaps AS (
       SELECT c.route_index, s.id AS segment_id, s.source_id AS segment_source_id,
         ST_Length(ST_Transform(s.geom, 25830)) AS segment_length_m,
         ST_Length(ST_CollectionExtract(
           ST_Intersection(ST_Transform(s.geom, 25830), r.corridor_m), 2
         )) AS overlap_length_m
       FROM candidates c
       JOIN street_segments s ON s.id = c.segment_id
       JOIN routes r ON r.route_index = c.route_index
     )
     SELECT route_index AS "routeIndex", segment_id AS "segmentId",
       segment_source_id AS "segmentSourceId", segment_length_m::float8 AS "segmentLengthM",
       overlap_length_m::float8 AS "overlapLengthM"
     FROM measured_overlaps
     WHERE segment_length_m > 0
       AND overlap_length_m / segment_length_m >= :minimumOverlapRatio
     ORDER BY route_index, segment_id`,
      {
        replacements: {
          routes: serializedRoutes,
          corridorM: ROUTE_CORRIDOR_M,
          minimumOverlapRatio: MIN_SEGMENT_OVERLAP_RATIO
        },
        type: QueryTypes.SELECT,
        transaction
      }
    )
  );
}

module.exports = {
  MIN_SEGMENT_OVERLAP_RATIO,
  ROUTE_CORRIDOR_M,
  findSegmentsForRoutes,
  validateRoutes
};
