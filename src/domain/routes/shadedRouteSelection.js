const MAX_DURATION_FACTOR = 1.25;
const MIN_SHADE_IMPROVEMENT_POINTS = 5;
const SUN_PENALTY_FACTOR = 0.5;

function environmentalCost(route) {
  if (route?.exposure?.status !== 'available') return Number.POSITIVE_INFINITY;
  return route.duration * (1 + SUN_PENALTY_FACTOR * (route.exposure.sunPercentage / 100));
}

function selectShadedRoute(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new TypeError('routes must be a non-empty array');
  }

  const fastest = [...routes].sort((left, right) => left.duration - right.duration)[0];
  if (fastest.exposure?.status !== 'available') {
    return { status: 'insufficient_exposure_data', fastest, shaded: null };
  }

  const maximumDuration = fastest.duration * MAX_DURATION_FACTOR;
  const eligible = routes
    .filter(
      (route) =>
        route.exposure?.status === 'available' &&
        route.duration <= maximumDuration &&
        route.exposure.shadePercentage >=
          fastest.exposure.shadePercentage + MIN_SHADE_IMPROVEMENT_POINTS
    )
    .sort((left, right) => environmentalCost(left) - environmentalCost(right));

  const shaded = eligible[0] || null;
  if (!shaded || environmentalCost(shaded) >= environmentalCost(fastest)) {
    return { status: 'no_better_alternative', fastest, shaded: null };
  }

  return {
    status: 'selected',
    fastest,
    shaded,
    additionalDurationSeconds: Math.max(0, shaded.duration - fastest.duration),
    shadeImprovementPercentagePoints:
      shaded.exposure.shadePercentage - fastest.exposure.shadePercentage
  };
}

module.exports = {
  MAX_DURATION_FACTOR,
  MIN_SHADE_IMPROVEMENT_POINTS,
  SUN_PENALTY_FACTOR,
  environmentalCost,
  selectShadedRoute
};
