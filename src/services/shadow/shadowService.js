const { shadowConfig } = require('../../config/shadowConfig');
const { calculateSolarPosition } = require('../../domain/solar/solarPosition');
const { shadowFactors, validateSegmentIds } = require('../../domain/shadow/shadowProjection');
const defaultRepository = require('../../repositories/shadowRepository');

/**
 * Calculates dynamic shade only for the requested pedestrian segments. It does not persist the
 * result because it is valid for one instant and one solar position.
 *
 * With the sun below the horizon there is nothing to project ('sun_below_horizon'). Below
 * config.minSunElevationDeg the shadows are too long to project safely ('sun_too_low', ADR-015).
 */
async function calculateSegmentShadows(
  { segmentIds, ...solarInput },
  {
    repository = defaultRepository,
    solarCalculator = calculateSolarPosition,
    config = shadowConfig
  } = {}
) {
  const requestedSegmentIds = validateSegmentIds(segmentIds);
  const solarPosition = solarCalculator(solarInput);
  const factors = shadowFactors(solarPosition);
  const dataQuality = await repository.getUrbanDataQuality();

  let skippedStatus = null;
  if (!factors) skippedStatus = 'sun_below_horizon';
  else if (solarPosition.elevationDegrees < config.minSunElevationDeg)
    skippedStatus = 'sun_too_low';

  if (skippedStatus) {
    return {
      status: skippedStatus,
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
    ...factors,
    timeoutMs: config.queryTimeoutMs
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
