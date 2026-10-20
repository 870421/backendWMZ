const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');

function select(sql, replacements) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
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
  northPerHeight
}) {
  return select(
    `WITH selected AS (
       SELECT id, source_id, ST_Transform(geom, 25830) AS geom_m
       FROM street_segments
       WHERE id IN (:segmentIds)
     ), building_candidates AS (
       SELECT DISTINCT b.id, b.source_id, b.height_m, b.height_source, b.height_suspicious,
         ST_Transform(b.geom, 25830) AS base_geom
       FROM buildings b
       JOIN selected s ON ST_DWithin(
         b.geom::geography,
         ST_Transform(s.geom_m, 4326)::geography,
         b.height_m * :lengthPerHeight
       )
       WHERE b.height_m > 0 AND ST_IsValid(b.geom) AND NOT ST_IsEmpty(b.geom)
     ), tree_candidates AS (
       SELECT DISTINCT t.id, t.source_id, t.height_m, t.crown_diameter_m,
         ST_Buffer(ST_Transform(t.geom, 25830), t.crown_diameter_m / 2, 'quad_segs=8') AS base_geom
       FROM trees t
       JOIN selected s ON ST_DWithin(
         t.geom::geography,
         ST_Transform(s.geom_m, 4326)::geography,
         t.height_m * :lengthPerHeight + t.crown_diameter_m / 2
       )
       WHERE t.height_m > 0 AND t.crown_diameter_m > 0
         AND ST_IsValid(t.geom) AND NOT ST_IsEmpty(t.geom)
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
    { segmentIds, lengthPerHeight, eastPerHeight, northPerHeight }
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

module.exports = { getUrbanDataQuality, projectAndAssociateShadows };
