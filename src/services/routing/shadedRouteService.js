const { calculateRouteExposure } = require('../../domain/routes/routeExposure');
const {
  MAX_DURATION_FACTOR,
  MIN_SHADE_IMPROVEMENT_POINTS,
  SUN_PENALTY_FACTOR,
  selectShadedRoute
} = require('../../domain/routes/shadedRouteSelection');
const { validateShadedRouteRequest } = require('../../domain/routes/routeRequest');
const { calculateSolarPosition } = require('../../domain/solar/solarPosition');
const {
  getAlternativeWalkingRoutes
} = require('../../integrations/openRouteService/directionsClient');
const defaultRouteSegmentRepository = require('../../repositories/routeSegmentRepository');
const { calculateSegmentExposures } = require('../shadow/exposureService');

function referenceFromSolarPosition(position) {
  return {
    instant: position.instant,
    localDateTime: position.localDateTime,
    timeZone: position.timeZone,
    latitude: position.latitude,
    longitude: position.longitude
  };
}

async function calculateShadedRouteComparison(
  input,
  {
    routesProvider = getAlternativeWalkingRoutes,
    routeSegmentRepository = defaultRouteSegmentRepository,
    exposureCalculator = calculateSegmentExposures,
    solarCalculator = calculateSolarPosition
  } = {}
) {
  const timeZone = validateShadedRouteRequest(input);
  const solarInput = {
    date: input.date,
    time: input.time,
    timeZone,
    latitude: input.origin.lat,
    longitude: input.origin.lng
  };
  // Validate and retain the reference before spending quota on ORS. The exposure service reuses
  // the same PBI-5.1 contract when it invokes PBI-5.2 for the mapped street segments.
  const solarPosition = solarCalculator(solarInput);
  const candidates = await routesProvider({
    origin: { lat: input.origin.lat, lng: input.origin.lng },
    destination: { lat: input.destination.lat, lng: input.destination.lng }
  });
  const indexedCandidates = candidates.map((route, routeIndex) => ({ ...route, routeIndex }));
  const coverageRows = await routeSegmentRepository.findSegmentsForRoutes(indexedCandidates);
  const segmentIds = [...new Set(coverageRows.map(({ segmentId }) => Number(segmentId)))];

  let exposureResult = null;
  if (segmentIds.length > 0) {
    exposureResult = await exposureCalculator({ segmentIds, ...solarInput });
  }
  const exposuresBySegmentId = new Map(
    (exposureResult?.segments || []).map((exposure) => [Number(exposure.segmentId), exposure])
  );

  const routes = indexedCandidates.map((route) => ({
    ...route,
    exposure: calculateRouteExposure(
      route,
      coverageRows.filter(({ routeIndex }) => Number(routeIndex) === route.routeIndex),
      exposuresBySegmentId
    )
  }));
  const selection = selectShadedRoute(routes);
  const status =
    exposureResult?.status === 'sun_below_horizon' ? 'sun_below_horizon' : selection.status;

  return {
    status,
    reference: exposureResult?.reference || referenceFromSolarPosition(solarPosition),
    fastest: selection.fastest,
    shaded: status === 'selected' ? selection.shaded : null,
    additionalDurationSeconds: status === 'selected' ? selection.additionalDurationSeconds : null,
    shadeImprovementPercentagePoints:
      status === 'selected' ? selection.shadeImprovementPercentagePoints : null,
    candidatesEvaluated: routes.length,
    strategy: {
      maximumDurationFactor: MAX_DURATION_FACTOR,
      minimumShadeImprovementPercentagePoints: MIN_SHADE_IMPROVEMENT_POINTS,
      sunPenaltyFactor: SUN_PENALTY_FACTOR
    }
  };
}

module.exports = { calculateShadedRouteComparison };
