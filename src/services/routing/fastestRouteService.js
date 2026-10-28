const { getFastestWalkingRoute } = require('../../integrations/openRouteService/directionsClient');
const { validateRoutePoints } = require('../../domain/routes/routeRequest');

async function calculateFastestRoute({ origin, destination } = {}) {
  validateRoutePoints({ origin, destination });

  return getFastestWalkingRoute({
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng }
  });
}

module.exports = { calculateFastestRoute };
