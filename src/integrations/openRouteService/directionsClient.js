const { env } = require('../../config/env');

const REQUEST_TIMEOUT_MS = 8000;

function providerError(status, message) {
  return Object.assign(new Error(message), { status });
}

function normalizePoint(point) {
  const lat = point?.lat;
  const lng = point?.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw providerError(400, 'Route coordinates are invalid.');
  }

  return [lng, lat];
}

function normalizeGeometry(geometry) {
  if (
    geometry?.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2
  )
    return null;

  const coordinates = geometry.coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const [lng, lat] = coordinate;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return null;
    return [lng, lat];
  });

  if (coordinates.some((coordinate) => coordinate === null)) return null;
  return { type: 'LineString', coordinates };
}

function normalizeRoute(data) {
  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length === 0
  )
    return null;

  const route = data.features[0];
  const geometry = normalizeGeometry(route?.geometry);
  const distance = route?.properties?.summary?.distance;
  const duration = route?.properties?.summary?.duration;

  if (
    !geometry ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(duration) ||
    duration < 0
  )
    return null;

  return { geometry, distance, duration };
}

async function getFastestWalkingRoute({ origin, destination }) {
  if (!env.openRouteServiceApiKey) {
    throw providerError(503, 'Route calculation is not configured.');
  }

  const coordinates = [normalizePoint(origin), normalizePoint(destination)];
  const baseUrl = env.openRouteServiceDirectionsBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/foot-walking/geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/geo+json',
        Authorization: env.openRouteServiceApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates,
        preference: 'fastest',
        instructions: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw providerError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? 'Route provider quota has been exceeded. Please try again shortly.'
          : 'Route provider is unavailable.'
      );
    }

    const route = normalizeRoute(await response.json());
    if (!route) throw providerError(502, 'Invalid route provider response.');
    return route;
  } catch (error) {
    if (controller.signal.aborted) {
      throw providerError(504, 'Route calculation timed out. Please try again.');
    }
    if (error.status) throw error;
    // Never forward provider response bodies, URLs or credentials to clients/logs.
    throw providerError(502, 'Route provider is unavailable.');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getFastestWalkingRoute };
