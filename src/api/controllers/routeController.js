const { calculateFastestRoute } = require('../../services/routing/fastestRouteService');
const { calculateShadedRouteComparison } = require('../../services/routing/shadedRouteService');
const { calculateWeightedRouteComparison } = require('../../services/routing/weightedRouteService');

async function postFastestRoute(req, res, next) {
  try {
    const route = await calculateFastestRoute(req.body);
    res.status(200).json({ route });
  } catch (error) {
    next(error);
  }
}

async function postShadedRoute(req, res, next) {
  try {
    const comparison = await calculateShadedRouteComparison(req.body);
    res.status(200).json({ comparison });
  } catch (error) {
    next(error);
  }
}

async function postWeightedRoute(req, res, next) {
  try {
    const comparison = await calculateWeightedRouteComparison(req.body);
    res.status(200).json({ comparison });
  } catch (error) {
    next(error);
  }
}

module.exports = { postFastestRoute, postShadedRoute, postWeightedRoute };
