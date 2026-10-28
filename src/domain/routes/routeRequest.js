const { ZARAGOZA_TIME_ZONE, parseLocalDateTime } = require('../solar/solarPosition');

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

function invalidRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function validateRoutePoints({ origin, destination } = {}) {
  if (!isValidPoint(origin) || !isValidPoint(destination)) {
    throw invalidRequest(
      'Origin and destination must contain valid latitude and longitude coordinates.'
    );
  }
}

function validateShadedRouteRequest(input = {}) {
  validateRoutePoints(input);
  const timeZone = input.timeZone || ZARAGOZA_TIME_ZONE;
  try {
    parseLocalDateTime(input.date, input.time, timeZone);
  } catch {
    throw invalidRequest('Date, time and time zone must identify an unambiguous local instant.');
  }
  return timeZone;
}

module.exports = { isValidPoint, validateRoutePoints, validateShadedRouteRequest };
