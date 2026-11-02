const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');

const SEGMENT_COLUMNS = `s.id, s.source_id AS "sourceId", s.osm_way_id AS "osmWayId", s.name,
  s.highway, s.length_m AS "lengthM", ST_AsGeoJSON(s.geom)::json AS geometry`;

async function selectOne(sql, replacements) {
  const [row] = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return row ?? null;
}

function getSegmentById(id) {
  return selectOne(`SELECT ${SEGMENT_COLUMNS} FROM street_segments s WHERE s.id = :id`, { id });
}

// Streets come from OSM; source_id is stable between databases, unlike the serial id.
function getSegmentBySourceId(sourceId) {
  return selectOne(
    `SELECT ${SEGMENT_COLUMNS} FROM street_segments s
     WHERE s.source = 'osm' AND s.source_id = :sourceId`,
    { sourceId }
  );
}

/*
 * Nearest segment to a point, with the strategy of the association (ADR-009): the GIST index on
 * the 4326 geometry gives the knn closest candidates in degrees, and the nearest one in metres is
 * chosen among them.
 */
function getNearestSegmentToPoint({ lat, lng }, knn) {
  return selectOne(
    `SELECT ${SEGMENT_COLUMNS}, ST_Distance(s.geom::geography, p.geom::geography) AS "distanceM"
     FROM (SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) AS geom) p
     CROSS JOIN LATERAL (
       SELECT c.* FROM street_segments c ORDER BY c.geom <-> p.geom LIMIT :knn
     ) s
     ORDER BY "distanceM", s.id
     LIMIT 1`,
    { lat, lng, knn }
  );
}

module.exports = { getSegmentById, getSegmentBySourceId, getNearestSegmentToPoint };
