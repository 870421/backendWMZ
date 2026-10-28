const MIN_EXPOSURE_COVERAGE_RATIO = 0.8;

function unavailableRouteExposure(reason, coverageRatio = 0) {
  return {
    status: 'unavailable',
    reason,
    coverageRatio,
    coveragePercentage: coverageRatio * 100,
    shadePercentage: null,
    sunPercentage: null
  };
}

function calculateRouteExposure(route, segmentCoverage, exposuresBySegmentId) {
  if (!Number.isFinite(route?.distance) || route.distance <= 0) {
    return unavailableRouteExposure('invalid_route_distance');
  }

  let coveredLengthM = 0;
  let weightedShadedLengthM = 0;

  segmentCoverage.forEach(({ segmentId, overlapLengthM }) => {
    const exposure = exposuresBySegmentId.get(Number(segmentId));
    const length = Number(overlapLengthM);
    if (exposure?.status !== 'available' || !Number.isFinite(length) || length <= 0) return;
    coveredLengthM += length;
    weightedShadedLengthM += length * exposure.shadeRatio;
  });

  const coverageRatio = Math.min(1, coveredLengthM / route.distance);
  if (coverageRatio < MIN_EXPOSURE_COVERAGE_RATIO) {
    return unavailableRouteExposure('insufficient_segment_coverage', coverageRatio);
  }

  const shadePercentage = Math.min(
    100,
    Math.max(0, (weightedShadedLengthM / coveredLengthM) * 100)
  );
  return {
    status: 'available',
    reason: null,
    coverageRatio,
    coveragePercentage: coverageRatio * 100,
    shadePercentage,
    sunPercentage: 100 - shadePercentage
  };
}

module.exports = {
  MIN_EXPOSURE_COVERAGE_RATIO,
  calculateRouteExposure,
  unavailableRouteExposure
};
