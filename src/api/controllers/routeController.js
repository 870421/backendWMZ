const { calculateFastestRoute } = require('../../services/routing/fastestRouteService');
const { calculateShadedRouteComparison } = require('../../services/routing/shadedRouteService');

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

module.exports = { postFastestRoute, postShadedRoute };
