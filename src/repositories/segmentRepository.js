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

/*
 * Straight pieces of a segment in EPSG:25830 (metres), for its orientation. The grid north there
 * differs from true north by about 1° in Zaragoza, negligible for the wind model (ADR-023).
 */
function getSegmentPieces(id) {
  return sequelize.query(
    `SELECT degrees(ST_Azimuth(ST_StartPoint(d.geom), ST_EndPoint(d.geom))) AS "bearingDeg",
            ST_Length(d.geom) AS "lengthM"
     FROM street_segments s
     CROSS JOIN LATERAL ST_DumpSegments(ST_Transform(s.geom, 25830)) d
     WHERE s.id = :id AND ST_Length(d.geom) > 0
     ORDER BY d.path`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
}

module.exports = {
  getSegmentById,
  getSegmentBySourceId,
  getNearestSegmentToPoint,
  getSegmentPieces
};
