const { env } = require('../../config/env');

function providerError(status, message) {
  return Object.assign(new Error(message), { status });
}

function normalizeFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  const properties = feature.properties || {};
  const label = properties.label || properties.name;
  if (typeof label !== 'string' || !label.trim()) return null;
  return {
    id: String(properties.gid || properties.id || `${lng},${lat}`),
    label: label.trim(),
    lat,
    lng,
    source: 'search'
  };
}

async function autocompletePlaces({ limit = 5, text }) {
  if (!env.openRouteServiceApiKey) throw providerError(503, 'Place search is not configured.');
  const url = new URL(`${env.openRouteServiceGeocodingBaseUrl.replace(/\/$/, '')}/autocomplete`);
  url.searchParams.set('text', text);
  url.searchParams.set('size', String(limit));
  url.searchParams.set('focus.point.lat', '41.6488');
  url.searchParams.set('focus.point.lon', '-0.8891');
  url.searchParams.set('boundary.country', 'ESP');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: env.openRouteServiceApiKey },
      signal: controller.signal
    });
    if (!response.ok) {
      throw providerError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? 'Place search is busy. Please try again shortly.'
          : 'Place search provider is unavailable.'
      );
    }
    const data = await response.json();
    if (!Array.isArray(data?.features)) throw providerError(502, 'Invalid place search response.');
    const seen = new Set();
    return data.features
      .map(normalizeFeature)
      .filter((place) => {
        if (!place || seen.has(place.id)) return false;
        seen.add(place.id);
        return true;
      })
      .slice(0, limit);
  } catch (error) {
    if (controller.signal.aborted)
      throw providerError(504, 'Place search timed out. Please try again.');
    if (error.status) throw error;
    // Never forward provider response bodies, URLs or credentials to clients/logs.
    throw providerError(502, 'Place search provider is unavailable.');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { autocompletePlaces };
