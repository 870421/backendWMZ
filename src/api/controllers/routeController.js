const { calculateFastestRoute } = require('../../services/routing/fastestRouteService');

async function postFastestRoute(req, res, next) {
  try {
    const route = await calculateFastestRoute(req.body);
    res.status(200).json({ route });
  } catch (error) {
    next(error);
  }
}

module.exports = { postFastestRoute };
