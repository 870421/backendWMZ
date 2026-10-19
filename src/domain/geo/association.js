/*
 * Rules of the association of trees and buildings to street segments (ADR-009). Trees use the
 * fixed radius ASSOC_TREE_RADIUS_M; the SQL in associationRepository applies the building radius
 * formula row by row, and buildingRadiusM is the same formula for the service and the tests.
 */

const ELEMENT_TYPES = ['tree', 'building'];

// A taller building casts a longer shadow, so it is linked to segments farther away.
function buildingRadiusM(heightM, config) {
  return Math.max(config.buildingMinRadiusM, (heightM ?? 0) * config.buildingHeightFactor);
}

function validateAssociationConfig(config) {
  const problems = [];
  const positive = ['maxNearestM', 'treeRadiusM', 'buildingMinRadiusM', 'buildingHeightFactor'];
  positive.forEach((key) => {
    if (!Number.isFinite(config[key]) || config[key] <= 0) problems.push(`${key} must be > 0`);
  });
  ['knnCandidates', 'batchSize'].forEach((key) => {
    if (!Number.isInteger(config[key]) || config[key] < 1) {
      problems.push(`${key} must be an integer >= 1`);
    }
  });
  if (!Number.isFinite(config.minPct) || config.minPct < 0 || config.minPct > 100) {
    problems.push('minPct must be between 0 and 100');
  }
  if (problems.length > 0) throw new Error(`Invalid association config: ${problems.join('; ')}`);
  return config;
}

/*
 * Decides the status of one element type. Every element must be either associated (nearest
 * segment within maxNearestM) or in unassociated_elements, and never in both; an unassociated
 * row must also point to an existing element (no orphans). Otherwise the run is a 'mismatch'.
 * pctAssociated is the share of associated elements (criterion 2).
 */
function evaluateAssociation(counts, minPct) {
  const { total, nearestOk, isolated, noSegment, invalidGeometry, overlap, orphans = 0 } = counts;
  const unassociated = isolated + noSegment + invalidGeometry;
  const reconciled = nearestOk + unassociated === total && overlap === 0 && orphans === 0;
  // With nothing to associate there is nothing missing.
  const pctAssociated = total === 0 ? 100 : (100 * nearestOk) / total;

  let status = 'success';
  if (!reconciled) status = 'mismatch';
  else if (pctAssociated < minPct) status = 'below_threshold';

  return { pctAssociated, unassociated, reconciled, status };
}

module.exports = {
  ELEMENT_TYPES,
  buildingRadiusM,
  validateAssociationConfig,
  evaluateAssociation
};
