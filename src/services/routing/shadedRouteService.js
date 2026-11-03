const {
  MAX_DURATION_FACTOR,
  MIN_SHADE_IMPROVEMENT_POINTS,
  SUN_PENALTY_FACTOR,
  selectShadedRoute
} = require('../../domain/routes/shadedRouteSelection');
const { evaluateRouteCandidates } = require('./routeCandidates');

async function calculateShadedRouteComparison(input, dependencies = {}) {
  const { routes, exposureStatus, reference } = await evaluateRouteCandidates(input, dependencies);
  const selection = selectShadedRoute(routes);
  const status = exposureStatus || selection.status;

  return {
    status,
    reference,
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
