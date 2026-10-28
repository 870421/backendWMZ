const {
  calculateSegmentExposure,
  unavailableExposure
} = require('../../domain/shadow/segmentExposure');
const { calculateSegmentShadows } = require('./shadowService');

function solarReference(solarPosition) {
  return {
    instant: solarPosition.instant,
    localDateTime: solarPosition.localDateTime,
    timeZone: solarPosition.timeZone,
    latitude: solarPosition.latitude,
    longitude: solarPosition.longitude
  };
}

/**
 * Converts the unioned shadow coverage from PBI-5.2 into reusable shade/sun exposure values.
 * All requested segments are evaluated in one shadow calculation to avoid duplicate PostGIS work.
 */
async function calculateSegmentExposures(
  input,
  { shadowsCalculator = calculateSegmentShadows } = {}
) {
  const shadowResult = await shadowsCalculator(input);
  const reference = solarReference(shadowResult.solarPosition);

  if (shadowResult.status === 'sun_below_horizon') {
    return {
      status: 'sun_below_horizon',
      reference,
      segments: shadowResult.requestedSegmentIds.map((segmentId) =>
        unavailableExposure(segmentId, 'sun_below_horizon')
      ),
      dataQuality: shadowResult.dataQuality
    };
  }

  const calculatedById = new Map(
    shadowResult.segments.map((segment) => [Number(segment.segmentId), segment])
  );

  return {
    status: 'calculated',
    reference,
    segments: shadowResult.requestedSegmentIds.map((segmentId) => {
      const segment = calculatedById.get(segmentId);
      return segment
        ? calculateSegmentExposure(segment)
        : unavailableExposure(segmentId, 'segment_not_found_or_invalid');
    }),
    dataQuality: shadowResult.dataQuality
  };
}

module.exports = { calculateSegmentExposures };
