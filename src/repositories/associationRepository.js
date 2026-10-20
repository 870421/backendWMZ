const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');

// Whitelist of the tables of each element type; nothing from the caller is interpolated in SQL.
const TABLES = {
  tree: {
    elements: 'trees',
    links: 'segment_trees',
    idColumn: 'tree_id',
    radiusSql: ':treeRadiusM'
  },
  building: {
    elements: 'buildings',
    links: 'segment_buildings',
    idColumn: 'building_id',
    // Same formula as domain/geo/association.js buildingRadiusM.
    radiusSql: 'GREATEST(:buildingMinRadiusM, COALESCE(e.height_m, 0) * :buildingHeightFactor)'
  }
};

function tablesOf(type) {
  const tables = TABLES[type];
  if (!tables) throw new Error(`Unknown element type ${type}`);
  return tables;
}

function select(sql, replacements, transaction) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
}

function withTransaction(callback) {
  return sequelize.transaction(callback);
}

async function createRun(type, params) {
  const [row] = await select(
    `INSERT INTO association_runs (element_type, params) VALUES (:type, CAST(:params AS jsonb))
     RETURNING id`,
    { type, params: JSON.stringify(params) }
  );
  return row.id;
}

async function finishRun(runId, fields) {
  await sequelize.query(
    `UPDATE association_runs SET
       finished_at = now(), status = :status, total = :total, nearest_ok = :nearestOk,
       isolated = :isolated, no_segment = :noSegment, invalid_geometry = :invalidGeometry,
       radius_links = :radiusLinks, pct_associated = :pctAssociated,
       avg_segments_per_element = :avgSegmentsPerElement, details = CAST(:details AS jsonb)
     WHERE id = :runId`,
    {
      replacements: {
        runId,
        status: fields.status,
        total: fields.total ?? null,
        nearestOk: fields.nearestOk ?? null,
        isolated: fields.isolated ?? null,
        noSegment: fields.noSegment ?? null,
        invalidGeometry: fields.invalidGeometry ?? null,
        radiusLinks: fields.radiusLinks ?? null,
        pctAssociated: fields.pctAssociated ?? null,
        avgSegmentsPerElement: fields.avgSegmentsPerElement ?? null,
        details: JSON.stringify(fields.details ?? {})
      }
    }
  );
}

// Starts the recalculation of a type: the previous associations of that type are discarded.
async function clearType(type, transaction) {
  const { links } = tablesOf(type);
  await sequelize.query(`DELETE FROM ${links}`, { transaction });
  await sequelize.query('DELETE FROM unassociated_elements WHERE element_type = :type', {
    replacements: { type },
    transaction
  });
}

async function idRange(type, transaction) {
  const { elements } = tablesOf(type);
  const [row] = await select(
    `SELECT min(id) AS "minId", max(id) AS "maxId" FROM ${elements}`,
    {},
    transaction
  );
  return { minId: row.minId, maxId: row.maxId };
}

/*
 * Nearest segment of every element with fromId <= id <= toId. The GIST index on the 4326
 * geometry returns the knnCandidates closest segments in degrees (<->); the nearest one in
 * metres is then chosen among them (ADR-009). Buildings are measured against their polygon.
 * Elements within maxNearestM get an is_nearest link; the rest go to unassociated_elements.
 */
async function associateNearest(type, range, config, runId, transaction) {
  const { elements, links, idColumn } = tablesOf(type);
  await sequelize.query(
    `WITH elems AS (
       SELECT id, geom, ST_IsValid(geom) AND NOT ST_IsEmpty(geom) AS valid
       FROM ${elements} WHERE id BETWEEN :fromId AND :toId
     ), nearest AS (
       SELECT e.id, e.valid, n.segment_id, n.distance_m
       FROM elems e
       LEFT JOIN LATERAL (
         SELECT c.id AS segment_id, ST_Distance(c.geom::geography, e.geom::geography) AS distance_m
         FROM (
           SELECT s.id, s.geom FROM street_segments s ORDER BY s.geom <-> e.geom LIMIT :knn
         ) c
         ORDER BY distance_m, c.id
         LIMIT 1
       ) n ON e.valid
     ), associated AS (
       INSERT INTO ${links} (segment_id, ${idColumn}, distance_m, is_nearest)
       SELECT segment_id, id, distance_m, true FROM nearest
       WHERE valid AND segment_id IS NOT NULL AND distance_m <= :maxNearestM
       RETURNING 1
     )
     INSERT INTO unassociated_elements
       (element_type, element_id, nearest_segment_id, nearest_distance_m, reason, association_run_id)
     SELECT :type, id, segment_id, distance_m,
       CASE WHEN NOT valid THEN 'invalid_geometry'
            WHEN segment_id IS NULL THEN 'no_segment'
            ELSE 'isolated' END,
       :runId
     FROM nearest
     WHERE NOT valid OR segment_id IS NULL OR distance_m > :maxNearestM`,
    {
      replacements: {
        type,
        runId,
        fromId: range.fromId,
        toId: range.toId,
        knn: config.knnCandidates,
        maxNearestM: config.maxNearestM
      },
      transaction
    }
  );
}

/*
 * Links every associated element of the id range to the other segments within its radius. The
 * condition uses s.geom::geography, the exact expression of street_segments_geog_gist. The
 * LATERAL subquery makes PostgreSQL search the index once per associated element: the links
 * just inserted in this transaction have no statistics, and with a plain join the planner chose
 * a merge join that computed the radius search for the whole batch first (30+ minutes).
 */
async function associateRadius(type, range, config, transaction) {
  const { elements, links, idColumn, radiusSql } = tablesOf(type);
  await sequelize.query(
    `INSERT INTO ${links} (segment_id, ${idColumn}, distance_m, is_nearest)
     SELECT s.id, e.id, ST_Distance(s.geom::geography, e.geom::geography), false
     FROM ${links} n
     JOIN ${elements} e ON e.id = n.${idColumn}
     CROSS JOIN LATERAL (
       SELECT s.id, s.geom FROM street_segments s
       WHERE ST_DWithin(s.geom::geography, e.geom::geography, ${radiusSql})
         AND s.id <> n.segment_id
     ) s
     WHERE n.is_nearest AND n.${idColumn} BETWEEN :fromId AND :toId`,
    {
      replacements: {
        fromId: range.fromId,
        toId: range.toId,
        treeRadiusM: config.treeRadiusM,
        buildingMinRadiusM: config.buildingMinRadiusM,
        buildingHeightFactor: config.buildingHeightFactor
      },
      transaction
    }
  );
}

// Counts used to reconcile a type (associated + unassociated = total, no element in both).
async function countResults(type, transaction) {
  const { elements, links, idColumn } = tablesOf(type);
  const [row] = await select(
    `SELECT
       (SELECT count(*) FROM ${elements})::int AS total,
       (SELECT count(*) FROM ${links} WHERE is_nearest)::int AS "nearestOk",
       (SELECT count(*) FROM unassociated_elements
          WHERE element_type = :type AND reason = 'isolated')::int AS isolated,
       (SELECT count(*) FROM unassociated_elements
          WHERE element_type = :type AND reason = 'no_segment')::int AS "noSegment",
       (SELECT count(*) FROM unassociated_elements
          WHERE element_type = :type AND reason = 'invalid_geometry')::int AS "invalidGeometry",
       (SELECT count(DISTINCT u.element_id) FROM unassociated_elements u
          JOIN ${links} l ON l.${idColumn} = u.element_id
          WHERE u.element_type = :type)::int AS overlap,
       (SELECT count(*) FROM unassociated_elements u
          WHERE u.element_type = :type
            AND NOT EXISTS (SELECT 1 FROM ${elements} e WHERE e.id = u.element_id))::int AS orphans,
       (SELECT count(*) FROM ${links} WHERE NOT is_nearest)::int AS "radiusLinks",
       (SELECT count(*)::float8 / NULLIF(count(DISTINCT ${idColumn}), 0)
          FROM ${links}) AS "avgSegmentsPerElement",
       (SELECT avg(distance_m) FROM ${links} WHERE is_nearest) AS "meanDistanceM",
       (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY distance_m)
          FROM ${links} WHERE is_nearest) AS "p95DistanceM"`,
    { type },
    transaction
  );
  return row;
}

/*
 * After an import, the latest finished association run of each affected type no longer
 * matches the data (ADR-010). Returns the number of runs marked as 'stale'.
 */
async function markStale(types, reason) {
  const [, result] = await sequelize.query(
    `UPDATE association_runs r SET
       status = 'stale',
       details = r.details || jsonb_build_object(
         'previousStatus', r.status, 'staleReason', CAST(:reason AS text), 'staleAt', now())
     WHERE r.id IN (
       SELECT DISTINCT ON (element_type) id FROM association_runs
       WHERE element_type IN (:types) AND status <> 'running'
       ORDER BY element_type, id DESC
     ) AND r.status NOT IN ('stale', 'failed')`,
    { replacements: { types, reason } }
  );
  return result.rowCount;
}

async function getTreesBySegment(segmentId) {
  return select(
    `SELECT t.id, t.source_id AS "sourceId", t.species, t.height_m AS "heightM",
       t.crown_diameter_m AS "crownDiameterM", st.distance_m AS "distanceM",
       st.is_nearest AS "isNearest", ST_AsGeoJSON(t.geom)::json AS geometry
     FROM segment_trees st JOIN trees t ON t.id = st.tree_id
     WHERE st.segment_id = :segmentId
     ORDER BY st.distance_m, t.id`,
    { segmentId }
  );
}

async function getBuildingsBySegment(segmentId) {
  return select(
    `SELECT b.id, b.source_id AS "sourceId", b.height_m AS "heightM",
       b.height_source AS "heightSource", b.height_suspicious AS "heightSuspicious", b.floors,
       sb.distance_m AS "distanceM", sb.is_nearest AS "isNearest",
       ST_AsGeoJSON(b.geom)::json AS geometry
     FROM segment_buildings sb JOIN buildings b ON b.id = sb.building_id
     WHERE sb.segment_id = :segmentId
     ORDER BY sb.distance_m, b.id`,
    { segmentId }
  );
}

/*
 * Nearest segment of a tree or building. Associated elements return their is_nearest link;
 * unassociated ones return the segment recorded in unassociated_elements and the reason.
 * Returns null when the element was never associated.
 */
async function getNearestSegmentForElement(type, elementId) {
  const { links, idColumn } = tablesOf(type);
  const [row] = await select(
    `SELECT l.segment_id AS "segmentId", l.distance_m AS "distanceM", true AS "isNearest",
       true AS associated, NULL AS reason, s.name, s.highway, s.length_m AS "lengthM"
     FROM ${links} l JOIN street_segments s ON s.id = l.segment_id
     WHERE l.${idColumn} = :elementId AND l.is_nearest
     UNION ALL
     SELECT u.nearest_segment_id, u.nearest_distance_m, true, false, u.reason, s.name, s.highway,
       s.length_m
     FROM unassociated_elements u LEFT JOIN street_segments s ON s.id = u.nearest_segment_id
     WHERE u.element_type = :type AND u.element_id = :elementId`,
    { type, elementId }
  );
  return row ?? null;
}

module.exports = {
  withTransaction,
  createRun,
  finishRun,
  clearType,
  idRange,
  associateNearest,
  associateRadius,
  countResults,
  markStale,
  getTreesBySegment,
  getBuildingsBySegment,
  getNearestSegmentForElement
};
