const {
  hasEnvironmentalWeight,
  parseMaxDetour,
  parseWeights
} = require('../../domain/routes/routeWeights');
const {
  MAX_DURATION_FACTOR,
  MIN_IMPROVEMENT_PERCENTAGE_POINTS,
  selectWeightedRoute
} = require('../../domain/routes/weightedRouteSelection');
const {
  getAlternativeWalkingRoutes
} = require('../../integrations/openRouteService/directionsClient');
const { calculateFastestRoute } = require('./fastestRouteService');
const { evaluateRouteCandidates } = require('./routeCandidates');

// Up to the 25 % of ADR-014 ORS is asked exactly as for the Shaded Route; beyond it, alternatives
// that are as long as the user accepts.
function alternativesWeightFactor(maxDurationFactor) {
  return Math.max(MAX_DURATION_FACTOR, maxDurationFactor);
}

/**
 * The fastest route and, if one of the ORS alternatives suits the weights better, that one
 * (ADR-023). With every weight at 0 only time matters: no alternatives or shadows are calculated.
 */
async function calculateWeightedRouteComparison(
  input,
  {
    fastestRouteCalculator = calculateFastestRoute,
    alternativesProvider = getAlternativeWalkingRoutes,
    ...dependencies
  } = {}
) {
  const weights = parseWeights(input?.weights);
  const maxDetourPercentage = parseMaxDetour(input?.maxDetourPercentage);
  const maxDurationFactor = 1 + maxDetourPercentage / 100;
  const strategy = {
    maximumDurationFactor: maxDurationFactor,
    minimumImprovementPercentagePoints: MIN_IMPROVEMENT_PERCENTAGE_POINTS
  };
  if (!hasEnvironmentalWeight(weights)) {
    const fastest = await fastestRouteCalculator(input);
    return {
      status: 'fastest_only',
      weights,
      fastest,
      selected: null,
      additionalDurationSeconds: null,
      shadeChangePercentagePoints: null,
      candidatesEvaluated: 1,
      strategy
    };
  }

  const weightFactor = alternativesWeightFactor(maxDurationFactor);
  const { routes, exposureStatus, reference } = await evaluateRouteCandidates(input, {
    routesProvider: (points) => alternativesProvider(points, { weightFactor }),
    ...dependencies
  });
  const selection = selectWeightedRoute(routes, weights, { maxDurationFactor });
  const status = exposureStatus || selection.status;
  const isSelected = status === 'selected';

  return {
    status,
    reference,
    weights,
    fastest: selection.fastest,
    selected: isSelected ? selection.selected : null,
    additionalDurationSeconds: isSelected ? selection.additionalDurationSeconds : null,
    shadeChangePercentagePoints: isSelected ? selection.shadeChangePercentagePoints : null,
    candidatesEvaluated: routes.length,
    strategy
  };
}

module.exports = { calculateWeightedRouteComparison };
