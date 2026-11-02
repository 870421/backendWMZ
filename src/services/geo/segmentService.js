const { associationConfig } = require('../../config/associationConfig');
const { importConfig } = require('../../config/importConfig');
const { buildingRadiusM } = require('../../domain/geo/association');
const { parseCoordinates, parseSourceId } = require('../../domain/segments/segmentRequest');
const defaultAssociations = require('../../repositories/associationRepository');
const defaultDataStatus = require('../../repositories/dataStatusRepository');
const defaultSegments = require('../../repositories/segmentRepository');
const { httpError } = require('../../utils/httpError');

const ASSOCIATION_TYPE = { trees: 'tree', buildings: 'building' };

// osm_way_id is a BIGINT, which pg returns as a string; OSM way ids fit in a Number exactly.
function toSegment(row) {
  return { ...row, osmWayId: Number(row.osmWayId) };
}

function segmentNotFound() {
  return httpError(404, 'No existe el tramo indicado.');
}

/*
 * Trees and buildings linked to a segment (nearest + radius, ADR-009). associationStale tells
 * if the latest association of a requested type was marked stale by a later import (ADR-010).
 */
async function getUrbanElements(
  segmentId,
  types,
  {
    segments = defaultSegments,
    associations = defaultAssociations,
    dataStatus = defaultDataStatus,
    config = associationConfig
  } = {}
) {
  const segment = await segments.getSegmentById(segmentId);
  if (!segment) throw segmentNotFound();

  const wantTrees = types.includes('trees');
  const wantBuildings = types.includes('buildings');
  const [trees, buildings, runs] = await Promise.all([
    wantTrees ? associations.getTreesBySegment(segmentId) : null,
    wantBuildings ? associations.getBuildingsBySegment(segmentId) : null,
    dataStatus.getLatestAssociationRuns(
      types.map((type) => ASSOCIATION_TYPE[type]),
      { includeRunning: false }
    )
  ]);

  const response = { segment: toSegment(segment) };
  const summary = {};
  if (wantTrees) {
    response.trees = trees;
    summary.trees = trees.length;
    summary.nearestTrees = trees.filter((tree) => tree.isNearest).length;
  }
  if (wantBuildings) {
    response.buildings = buildings.map((building) => ({
      ...building,
      associationRadiusM: buildingRadiusM(building.heightM, config)
    }));
    summary.buildings = buildings.length;
    summary.nearestBuildings = buildings.filter((building) => building.isNearest).length;
  }
  summary.associationStale = runs.some((run) => run.status === 'stale');
  return { ...response, summary };
}

async function getNearestSegment(
  query,
  {
    segments = defaultSegments,
    config = associationConfig,
    serviceArea = importConfig.zaragozaBbox
  } = {}
) {
  const point = parseCoordinates(query, serviceArea);
  const nearest = await segments.getNearestSegmentToPoint(point, config.knnCandidates);
  if (!nearest || nearest.distanceM > config.maxNearestM) {
    throw httpError(
      404,
      `No hay ningún tramo a menos de ${config.maxNearestM} m del punto indicado.`
    );
  }
  return toSegment(nearest);
}

async function getSegmentBySourceId(sourceId, { segments = defaultSegments } = {}) {
  const segment = await segments.getSegmentBySourceId(parseSourceId(sourceId));
  if (!segment) throw segmentNotFound();
  return toSegment(segment);
}

module.exports = { getUrbanElements, getNearestSegment, getSegmentBySourceId };
