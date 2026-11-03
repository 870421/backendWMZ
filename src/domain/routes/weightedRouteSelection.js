// Choice among the ORS candidates with the user's weights (ADR-023). It generalises the cost of
// ADR-014: with a shade weight of 50 % and a 25 % detour it is exactly the Shaded Route of PBI-5.4.
const MAX_DURATION_FACTOR = 1.25;
const MIN_IMPROVEMENT_PERCENTAGE_POINTS = 5;

// Percentage of the route exposed to what the weights penalise: sun for shade, shade for sun.
function exposurePenalty(route, weights) {
  const total = weights.shade + weights.sun;
  if (total === 0) return 0;
  const { sunPercentage, shadePercentage } = route.exposure;
  return (weights.shade * sunPercentage + weights.sun * shadePercentage) / total;
}

function weightedCost(route, weights) {
  if (route?.exposure?.status !== 'available') return Number.POSITIVE_INFINITY;
  const { sunPercentage, shadePercentage } = route.exposure;
  return (
    route.duration * (1 + (weights.shade * sunPercentage + weights.sun * shadePercentage) / 10000)
  );
}

function selectWeightedRoute(routes, weights, { maxDurationFactor = MAX_DURATION_FACTOR } = {}) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new TypeError('routes must be a non-empty array');
  }

  const fastest = [...routes].sort((left, right) => left.duration - right.duration)[0];
  if (fastest.exposure?.status !== 'available') {
    return { status: 'insufficient_exposure_data', fastest, selected: null };
  }

  const maximumDuration = fastest.duration * maxDurationFactor;
  const fastestPenalty = exposurePenalty(fastest, weights);
  const eligible = routes
    .filter(
      (route) =>
        route.exposure?.status === 'available' &&
        route.duration <= maximumDuration &&
        exposurePenalty(route, weights) <= fastestPenalty - MIN_IMPROVEMENT_PERCENTAGE_POINTS
    )
    .sort((left, right) => weightedCost(left, weights) - weightedCost(right, weights));

  const selected = eligible[0] || null;
  if (!selected || weightedCost(selected, weights) >= weightedCost(fastest, weights)) {
    return { status: 'no_better_alternative', fastest, selected: null };
  }

  return {
    status: 'selected',
    fastest,
    selected,
    additionalDurationSeconds: Math.max(0, selected.duration - fastest.duration),
    shadeChangePercentagePoints:
      selected.exposure.shadePercentage - fastest.exposure.shadePercentage
  };
}

module.exports = {
  MAX_DURATION_FACTOR,
  MIN_IMPROVEMENT_PERCENTAGE_POINTS,
  exposurePenalty,
  selectWeightedRoute,
  weightedCost
};
