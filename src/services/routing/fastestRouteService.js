const { getFastestWalkingRoute } = require('../../integrations/openRouteService/directionsClient');

function isValidPoint(point) {
  return (
    point !== null &&
    typeof point === 'object' &&
    !Array.isArray(point) &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180
  );
}

async function calculateFastestRoute({ origin, destination } = {}) {
  if (!isValidPoint(origin) || !isValidPoint(destination)) {
    const error = new Error(
      'Origin and destination must contain valid latitude and longitude coordinates.'
    );
    error.status = 400;
    throw error;
  }

  return getFastestWalkingRoute({
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: destination.lat, lng: destination.lng },
  });
}

module.exports = { calculateFastestRoute };
