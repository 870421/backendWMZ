const { calculateSolarPosition } = require('../../domain/solar/solarPosition');
const { shadowFactors, validateSegmentIds } = require('../../domain/shadow/shadowProjection');
const defaultRepository = require('../../repositories/shadowRepository');

/**
 * Calculates dynamic shade only for the requested pedestrian segments. It does not persist the
 * result because it is valid for one instant and one solar position.
 */
async function calculateSegmentShadows(
  { segmentIds, ...solarInput },
  { repository = defaultRepository, solarCalculator = calculateSolarPosition } = {}
) {
  const requestedSegmentIds = validateSegmentIds(segmentIds);
  const solarPosition = solarCalculator(solarInput);
  const factors = shadowFactors(solarPosition);
  const dataQuality = await repository.getUrbanDataQuality();

  if (!factors) {
    return {
      status: 'sun_below_horizon',
      solarPosition,
      projection: null,
      segments: [],
      requestedSegmentIds,
      missingSegmentIds: [],
      dataQuality
    };
  }

  const segments = await repository.projectAndAssociateShadows({
    segmentIds: requestedSegmentIds,
    ...factors
  });
  const found = new Set(segments.map(({ segmentId }) => Number(segmentId)));

  return {
    status: 'calculated',
    solarPosition,
    projection: factors,
    segments,
    requestedSegmentIds,
    missingSegmentIds: requestedSegmentIds.filter((id) => !found.has(id)),
    dataQuality
  };
}

module.exports = { calculateSegmentShadows };
