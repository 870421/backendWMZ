const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');

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
 */
async function findSegmentsForRoutes(routes) {
  validateRoutes(routes);
  const serializedRoutes = JSON.stringify(
    routes.map(({ routeIndex, geometry }) => ({ routeIndex, geometry }))
  );

  return sequelize.query(
    `WITH input_routes AS (
       SELECT (item->>'routeIndex')::integer AS route_index,
         ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON((item->'geometry')::text), 4326), 25830)
           AS route_geom_m
       FROM jsonb_array_elements(CAST(:routes AS jsonb)) AS entries(item)
     ), candidates AS (
       SELECT r.route_index, s.id AS segment_id, s.source_id AS segment_source_id,
         ST_Transform(s.geom, 25830) AS segment_geom_m, r.route_geom_m
       FROM input_routes r
       JOIN street_segments s ON ST_DWithin(
         s.geom::geography,
         ST_Transform(r.route_geom_m, 4326)::geography,
         :corridorM
       )
       WHERE ST_IsValid(s.geom) AND NOT ST_IsEmpty(s.geom)
     ), measured_overlaps AS (
       SELECT route_index, segment_id, segment_source_id,
         ST_Length(segment_geom_m) AS segment_length_m,
         ST_Length(ST_CollectionExtract(
           ST_Intersection(segment_geom_m, ST_Buffer(route_geom_m, :corridorM)), 2
         )) AS overlap_length_m
       FROM candidates
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
      type: QueryTypes.SELECT
    }
  );
}

module.exports = {
  MIN_SEGMENT_OVERLAP_RATIO,
  ROUTE_CORRIDOR_M,
  findSegmentsForRoutes,
  validateRoutes
};
