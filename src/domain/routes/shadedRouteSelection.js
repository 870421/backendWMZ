const { PRESET_PROFILES } = require('./routeWeights');
const {
  MAX_DURATION_FACTOR,
  MIN_IMPROVEMENT_PERCENTAGE_POINTS,
  selectWeightedRoute,
  weightedCost
} = require('./weightedRouteSelection');

// The Shaded Route of PBI-5.4 (ADR-014) is the "Sombreada" preset of the weighted selection.
const SHADED_WEIGHTS = PRESET_PROFILES.find(({ presetKey }) => presetKey === 'shaded').weights;
const MIN_SHADE_IMPROVEMENT_POINTS = MIN_IMPROVEMENT_PERCENTAGE_POINTS;
const SUN_PENALTY_FACTOR = SHADED_WEIGHTS.shade / 100;

function environmentalCost(route) {
  return weightedCost(route, SHADED_WEIGHTS);
}

function selectShadedRoute(routes) {
  const { selected, shadeChangePercentagePoints, ...selection } = selectWeightedRoute(
    routes,
    SHADED_WEIGHTS
  );
  if (selection.status !== 'selected') return { ...selection, shaded: null };
  return {
    ...selection,
    shaded: selected,
    shadeImprovementPercentagePoints: shadeChangePercentagePoints
  };
}

module.exports = {
  MAX_DURATION_FACTOR,
  MIN_SHADE_IMPROVEMENT_POINTS,
  SUN_PENALTY_FACTOR,
  environmentalCost,
  selectShadedRoute
};
