const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function unavailableExposure(segmentId, reason, segmentSourceId = null) {
  return {
    segmentId,
    segmentSourceId,
    status: 'unavailable',
    reason,
    segmentLengthM: null,
    shadedLengthM: null,
    sunnyLengthM: null,
    shadeRatio: null,
    shadePercentage: null,
    sunPercentage: null
  };
}

function calculateSegmentExposure(segment) {
  const segmentId = Number(segment?.segmentId);
  const segmentLengthM = Number(segment?.segmentLengthM);
  const shadedLengthM = Number(segment?.shadedLengthM);

  if (!Number.isInteger(segmentId) || segmentId <= 0) {
    throw new TypeError('segmentId must be a positive integer');
  }
  if (!Number.isFinite(segmentLengthM) || segmentLengthM <= 0) {
    return unavailableExposure(segmentId, 'invalid_segment_length', segment?.segmentSourceId);
  }
  if (!Number.isFinite(shadedLengthM)) {
    return unavailableExposure(segmentId, 'invalid_shaded_length', segment?.segmentSourceId);
  }

  // PBI-5.2 already unions overlapping shadow polygons. Clamp defensively so provider/database
  // precision cannot produce negative lengths or percentages above 100.
  const normalizedShadedLengthM = clamp(shadedLengthM, 0, segmentLengthM);
  const shadeRatio = normalizedShadedLengthM / segmentLengthM;
  const shadePercentage = shadeRatio * 100;

  return {
    segmentId,
    segmentSourceId: segment?.segmentSourceId ?? null,
    status: 'available',
    reason: null,
    segmentLengthM,
    shadedLengthM: normalizedShadedLengthM,
    sunnyLengthM: segmentLengthM - normalizedShadedLengthM,
    shadeRatio,
    shadePercentage,
    sunPercentage: 100 - shadePercentage
  };
}

module.exports = { calculateSegmentExposure, unavailableExposure };
