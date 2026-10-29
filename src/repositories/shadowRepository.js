const { QueryTypes } = require('sequelize');

const { associationConfig } = require('../config/associationConfig');
const { sequelize } = require('../config/database');
const { shadowConfig } = require('../config/shadowConfig');
const { httpError } = require('../utils/httpError');

// SQLSTATE of a statement cancelled by statement_timeout.
const QUERY_CANCELED = '57014';

function select(sql, replacements, transaction) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
}

/*
 * Runs callback(transaction) with a PostgreSQL statement_timeout that only applies to that
 * transaction (SET LOCAL), so a heavy request cannot keep the database busy indefinitely
 * (ADR-015). A timeout becomes a controlled 504.
 */
async function withStatementTimeout(timeoutMs, callback) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
  try {
    return await sequelize.transaction(async (transaction) => {
      // SET does not accept bind parameters; timeoutMs is a validated integer.
      await sequelize.query(`SET LOCAL statement_timeout = ${timeoutMs}`, { transaction });
      return callback(transaction);
    });
  } catch (error) {
    if (error.original?.code === QUERY_CANCELED) {
      throw httpError(504, 'Shadow calculation timed out. Please try again.');
    }
    throw error;
  }
}

/*
 * Projects in ETRS89 / UTM zone 30N (EPSG:25830), the metric CRS of the Zaragoza source data.
 * A shadow is the convex hull of the ground geometry and its translated copy. This is exact for
 * convex footprints and deliberately conservative for concave or multipart footprints.
 */
async function projectAndAssociateShadows({
  segmentIds,
  lengthPerHeight,
  eastPerHeight,
  northPerHeight,
  timeoutMs = shadowConfig.queryTimeoutMs
}) {
  return withStatementTimeout(timeoutMs, (transaction) =>
    select(
      `WITH selected AS (
       SELECT id, source_id, ST_Transform(geom, 25830) AS geom_m
       FROM street_segments
       WHERE id IN (:segmentIds)
         AND ST_IsValid(geom) AND NOT ST_IsEmpty(geom)
     ), route_extent AS (
       SELECT ST_Collect(ST_Transform(geom_m, 4326)) AS route_geom
       FROM selected
     ), search_limits AS (
       SELECT
         COALESCE((SELECT max(height_m) FROM buildings WHERE height_m > 0), 0)
           * :lengthPerHeight AS building_search_m,
         COALESCE((SELECT max(height_m * :lengthPerHeight + crown_diameter_m / 2)
           FROM trees WHERE height_m > 0 AND crown_diameter_m > 0), 0) AS tree_search_m
     ), search_areas AS (
       SELECT
         ST_Envelope(ST_Buffer(e.route_geom::geography, l.building_search_m)::geometry)
           AS building_bbox,
         ST_Envelope(ST_Buffer(e.route_geom::geography, l.tree_search_m)::geometry) AS tree_bbox
       FROM route_extent e CROSS JOIN search_limits l
     ), building_candidate_rows AS (
       SELECT b.id, b.source_id, b.height_m, b.height_source, b.height_suspicious, b.geom
       FROM buildings b
       JOIN segment_buildings sb ON sb.building_id = b.id
       JOIN selected s ON s.id = sb.segment_id
       WHERE b.height_m > 0 AND ST_IsValid(b.geom) AND NOT ST_IsEmpty(b.geom)
         AND sb.distance_m <= b.height_m * :lengthPerHeight
       UNION ALL
       SELECT b.id, b.source_id, b.height_m, b.height_source, b.height_suspicious, b.geom
       FROM buildings b
       JOIN search_areas a ON b.geom && a.building_bbox
       JOIN route_extent e ON ST_DWithin(
         b.geom::geography,
         e.route_geom::geography,
         b.height_m * :lengthPerHeight
       )
       WHERE :useExtendedBuildingSearch
         AND b.height_m > 0 AND ST_IsValid(b.geom) AND NOT ST_IsEmpty(b.geom)
     ), building_candidates AS (
       SELECT DISTINCT id, source_id, height_m, height_source, height_suspicious,
         ST_Transform(geom, 25830) AS base_geom
       FROM building_candidate_rows
     ), tree_candidate_rows AS (
       SELECT t.id, t.source_id, t.height_m, t.crown_diameter_m, t.geom
       FROM trees t
       JOIN segment_trees st ON st.tree_id = t.id
       JOIN selected s ON s.id = st.segment_id
       WHERE t.height_m > 0 AND t.crown_diameter_m > 0
         AND ST_IsValid(t.geom) AND NOT ST_IsEmpty(t.geom)
         AND st.distance_m <= t.height_m * :lengthPerHeight + t.crown_diameter_m / 2
       UNION ALL
       SELECT t.id, t.source_id, t.height_m, t.crown_diameter_m, t.geom
       FROM trees t
       JOIN search_areas a ON t.geom && a.tree_bbox
       JOIN route_extent e ON ST_DWithin(
         t.geom::geography,
         e.route_geom::geography,
         t.height_m * :lengthPerHeight + t.crown_diameter_m / 2
       )
       WHERE t.height_m > 0 AND t.crown_diameter_m > 0
         AND ST_IsValid(t.geom) AND NOT ST_IsEmpty(t.geom)
         AND t.height_m * :lengthPerHeight + t.crown_diameter_m / 2 > :treeAssociationRadiusM
     ), tree_candidates AS (
       SELECT DISTINCT id, source_id, height_m, crown_diameter_m,
         ST_Buffer(ST_Transform(geom, 25830), crown_diameter_m / 2, 'quad_segs=8') AS base_geom
       FROM tree_candidate_rows
     ), building_shadows AS (
       SELECT 'building'::text AS element_type, id AS element_id, source_id, height_m,
         height_source, height_suspicious, NULL::double precision AS crown_diameter_m,
         ST_ConvexHull(ST_Collect(
           base_geom,
           ST_Translate(base_geom, :eastPerHeight * height_m, :northPerHeight * height_m)
         )) AS shadow_geom
       FROM building_candidates
     ), tree_shadows AS (
       SELECT 'tree'::text AS element_type, id AS element_id, source_id, height_m,
         NULL::text AS height_source, NULL::boolean AS height_suspicious, crown_diameter_m,
         ST_ConvexHull(ST_Collect(
           base_geom,
           ST_Translate(base_geom, :eastPerHeight * height_m, :northPerHeight * height_m)
         )) AS shadow_geom
       FROM tree_candidates
     ), shadows AS (
       SELECT * FROM building_shadows UNION ALL SELECT * FROM tree_shadows
     ), intersections AS (
       SELECT s.id AS segment_id, sh.*,
         ST_CollectionExtract(ST_Intersection(s.geom_m, sh.shadow_geom), 2) AS line_geom
       FROM selected s
       JOIN shadows sh ON s.geom_m && sh.shadow_geom AND ST_Intersects(s.geom_m, sh.shadow_geom)
     ), hits AS (
       SELECT *, ST_Length(line_geom) AS hit_length_m
       FROM intersections
       WHERE NOT ST_IsEmpty(line_geom)
     ), coverage AS (
       SELECT s.id AS segment_id,
         ST_Length(ST_CollectionExtract(
           ST_Intersection(s.geom_m, ST_UnaryUnion(ST_Collect(h.shadow_geom))), 2
         )) AS shaded_length_m
       FROM selected s
       JOIN hits h ON h.segment_id = s.id
       GROUP BY s.id, s.geom_m
     )
     SELECT s.id AS "segmentId", s.source_id AS "segmentSourceId",
       ST_Length(s.geom_m) AS "segmentLengthM",
       COALESCE(c.shaded_length_m, 0)::float8 AS "shadedLengthM",
       CASE WHEN ST_Length(s.geom_m) > 0
         THEN LEAST(1, COALESCE(c.shaded_length_m, 0) / ST_Length(s.geom_m))
         ELSE 0 END::float8 AS "shadeRatio",
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'elementType', h.element_type,
             'elementId', h.element_id,
             'sourceId', h.source_id,
             'heightM', h.height_m,
             'heightSource', h.height_source,
             'heightSuspicious', h.height_suspicious,
             'crownDiameterM', h.crown_diameter_m,
             'shadedLengthM', h.hit_length_m
           ) ORDER BY h.element_type, h.element_id
         ) FILTER (WHERE h.element_id IS NOT NULL),
         '[]'::jsonb
       ) AS associations
     FROM selected s
     LEFT JOIN hits h ON h.segment_id = s.id
     LEFT JOIN coverage c ON c.segment_id = s.id
     GROUP BY s.id, s.source_id, s.geom_m, c.shaded_length_m
     ORDER BY s.id`,
      {
        segmentIds,
        lengthPerHeight,
        eastPerHeight,
        northPerHeight,
        treeAssociationRadiusM: associationConfig.treeRadiusM,
        useExtendedBuildingSearch: lengthPerHeight > associationConfig.buildingHeightFactor
      },
      transaction
    )
  );
}

async function getUrbanDataQuality() {
  const [quality] = await select(
    `SELECT
       (SELECT count(*)::int FROM buildings) AS "buildingsTotal",
       (SELECT count(*)::int FROM buildings
         WHERE height_m > 0 AND ST_IsValid(geom) AND NOT ST_IsEmpty(geom)) AS "buildingsUsable",
       (SELECT count(*)::int FROM buildings
         WHERE height_m IS NULL OR height_m <= 0) AS "buildingsMissingHeight",
       (SELECT count(*)::int FROM buildings
         WHERE height_m > 0 AND (NOT ST_IsValid(geom) OR ST_IsEmpty(geom))) AS "buildingsInvalidGeometry",
       (SELECT count(*)::int FROM trees) AS "treesTotal",
       (SELECT count(*)::int FROM trees
         WHERE height_m > 0 AND crown_diameter_m > 0
           AND ST_IsValid(geom) AND NOT ST_IsEmpty(geom)) AS "treesUsable",
       (SELECT count(*)::int FROM trees
         WHERE height_m IS NULL OR height_m <= 0) AS "treesMissingHeight",
       (SELECT count(*)::int FROM trees
         WHERE height_m > 0 AND (crown_diameter_m IS NULL OR crown_diameter_m <= 0))
         AS "treesMissingCrownDiameter",
       (SELECT count(*)::int FROM trees
         WHERE height_m > 0 AND crown_diameter_m > 0
           AND (NOT ST_IsValid(geom) OR ST_IsEmpty(geom))) AS "treesInvalidGeometry"`
  );
  return quality;
}

module.exports = { getUrbanDataQuality, projectAndAssociateShadows, withStatementTimeout };
