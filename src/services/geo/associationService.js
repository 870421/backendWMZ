const { associationConfig } = require('../../config/associationConfig');
const {
  ELEMENT_TYPES,
  buildingRadiusM,
  evaluateAssociation,
  validateAssociationConfig
} = require('../../domain/geo/association');
const defaultRepository = require('../../repositories/associationRepository');
const { logger } = require('../../utils/logger');

function runParams(config) {
  const {
    maxNearestM,
    knnCandidates,
    treeRadiusM,
    buildingMinRadiusM,
    buildingHeightFactor,
    minPct,
    batchSize
  } = config;
  return {
    maxNearestM,
    knnCandidates,
    treeRadiusM,
    buildingMinRadiusM,
    buildingHeightFactor,
    minPct,
    batchSize
  };
}

/*
 * Recalculates the associations of one element type inside a single transaction: it deletes
 * the previous ones, associates the elements by id range and reconciles the counts. The result
 * is stored in association_runs whatever the outcome.
 */
async function associateType(type, { config, repository }) {
  const startedAt = Date.now();
  const runId = await repository.createRun(type, runParams(config));
  try {
    const counts = await repository.withTransaction(async (transaction) => {
      await repository.clearType(type, transaction);
      const { minId, maxId } = await repository.idRange(type, transaction);
      if (minId !== null && minId !== undefined) {
        for (let fromId = minId; fromId <= maxId; fromId += config.batchSize) {
          const range = { fromId, toId: fromId + config.batchSize - 1 };
          // Batches run one after another inside the same transaction.
          // eslint-disable-next-line no-await-in-loop
          await repository.associateNearest(type, range, config, runId, transaction);
          // eslint-disable-next-line no-await-in-loop
          await repository.associateRadius(type, range, config, transaction);
          logger.info(`[associate:${type}] ids ${range.fromId}-${Math.min(range.toId, maxId)}`);
        }
      }
      return repository.countResults(type, transaction);
    });

    const evaluation = evaluateAssociation(counts, config.minPct);
    const summary = {
      runId,
      type,
      ...counts,
      ...evaluation,
      durationMs: Date.now() - startedAt
    };
    await repository.finishRun(runId, {
      ...summary,
      details: {
        durationMs: summary.durationMs,
        overlap: counts.overlap,
        orphans: counts.orphans,
        meanDistanceM: counts.meanDistanceM,
        p95DistanceM: counts.p95DistanceM
      }
    });
    return summary;
  } catch (error) {
    await repository.finishRun(runId, {
      status: 'failed',
      details: { error: error.message, durationMs: Date.now() - startedAt }
    });
    throw error;
  }
}

/*
 * "npm run associate": associates every requested type (trees and buildings by default) and
 * returns one summary per type. Each type has its own transaction, so a failure in one does
 * not undo the other.
 */
async function runAssociation({
  types = ELEMENT_TYPES,
  config = associationConfig,
  repository = defaultRepository
} = {}) {
  validateAssociationConfig(config);
  const summaries = [];
  for (const type of types) {
    if (!ELEMENT_TYPES.includes(type)) throw new Error(`Unknown element type ${type}`);
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await associateType(type, { config, repository }));
  }
  return summaries;
}

/*
 * Read access for the comfort and shadow calculations (PBI-5). Buildings also carry the radius
 * that linked them, so a caller can tell how far their shadow is expected to reach.
 */
function getTreesBySegment(segmentId, { repository = defaultRepository } = {}) {
  return repository.getTreesBySegment(segmentId);
}

async function getBuildingsBySegment(
  segmentId,
  { repository = defaultRepository, config = associationConfig } = {}
) {
  const buildings = await repository.getBuildingsBySegment(segmentId);
  return buildings.map((building) => ({
    ...building,
    associationRadiusM: buildingRadiusM(building.heightM, config)
  }));
}

function getNearestSegmentForElement(type, elementId, { repository = defaultRepository } = {}) {
  if (!ELEMENT_TYPES.includes(type)) throw new Error(`Unknown element type ${type}`);
  return repository.getNearestSegmentForElement(type, elementId);
}

module.exports = {
  runAssociation,
  getTreesBySegment,
  getBuildingsBySegment,
  getNearestSegmentForElement
};
