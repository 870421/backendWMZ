const { numberFromEnv } = require('./importConfig');

// Association of trees and buildings to street segments; every value is explained in ADR-009
// (workspace docs/DECISIONS.md).
const associationConfig = {
  // An element whose nearest segment is farther than this is 'isolated' (not associated).
  maxNearestM: numberFromEnv('ASSOC_MAX_NEAREST_M', 150),
  // Candidates taken by the 4326 KNN index (<->, degrees) before choosing the minimum in metres.
  knnCandidates: numberFromEnv('ASSOC_KNN_CANDIDATES', 10),
  // Every segment within this distance of a tree is linked to it.
  treeRadiusM: numberFromEnv('ASSOC_TREE_RADIUS_M', 25),
  // Buildings: radius = max(buildingMinRadiusM, height_m × buildingHeightFactor).
  buildingMinRadiusM: numberFromEnv('ASSOC_BUILDING_MIN_RADIUS_M', 30),
  buildingHeightFactor: numberFromEnv('ASSOC_BUILDING_HEIGHT_FACTOR', 1.5),
  // The command fails if fewer than this % of a type have a nearest segment within maxNearestM.
  minPct: numberFromEnv('ASSOC_MIN_PCT', 95),
  // Elements per INSERT ... SELECT, by id range, inside the transaction of each type.
  batchSize: numberFromEnv('ASSOC_BATCH_SIZE', 20000)
};

module.exports = { associationConfig };
