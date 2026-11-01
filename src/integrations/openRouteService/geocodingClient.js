const { env } = require('../../config/env');
const { importConfig } = require('../../config/importConfig');

function providerError(status, message) {
  return Object.assign(new Error(message), { status });
}

// A clicked point is named after what is really there: farther than this, a name would mislead
// (in the middle of the river the nearest result is a park 100 m away).
const REVERSE_MAX_DISTANCE_KM = 0.15;
// A venue this close was clicked on purpose: it wins over the address of its own building, which
// is usually at the same distance.
const REVERSE_VENUE_DISTANCE_KM = 0.015;

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

async function requestFeatures(url) {
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
    return data.features;
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

async function autocompletePlaces({ limit = 5, text }) {
  if (!env.openRouteServiceApiKey) throw providerError(503, 'Place search is not configured.');
  const url = new URL(`${env.openRouteServiceGeocodingBaseUrl.replace(/\/$/, '')}/autocomplete`);
  url.searchParams.set('text', text);
  url.searchParams.set('size', String(limit));
  url.searchParams.set('focus.point.lat', '41.6488');
  url.searchParams.set('focus.point.lon', '-0.8891');
  url.searchParams.set('boundary.country', 'ESP');
  // Only suggest places the app can route to: the municipality of Zaragoza.
  const { minLat, minLng, maxLat, maxLng } = importConfig.zaragozaBbox;
  url.searchParams.set('boundary.rect.min_lat', String(minLat));
  url.searchParams.set('boundary.rect.min_lon', String(minLng));
  url.searchParams.set('boundary.rect.max_lat', String(maxLat));
  url.searchParams.set('boundary.rect.max_lon', String(maxLng));
  const features = await requestFeatures(url);
  const seen = new Set();
  return features
    .map(normalizeFeature)
    .filter((place) => {
      if (!place || seen.has(place.id)) return false;
      seen.add(place.id);
      return true;
    })
    .slice(0, limit);
}

function chooseReverseFeature(features) {
  const candidates = features
    .map((feature) => ({ place: normalizeFeature(feature), properties: feature?.properties }))
    .filter(
      ({ place, properties }) =>
        place &&
        Number.isFinite(properties?.distance) &&
        properties.distance <= REVERSE_MAX_DISTANCE_KM
    );
  const venue = candidates.find(
    ({ properties }) =>
      properties.layer === 'venue' && properties.distance <= REVERSE_VENUE_DISTANCE_KM
  );
  // The provider does not always sort by distance.
  const [nearest] = [...candidates].sort((a, b) => a.properties.distance - b.properties.distance);
  return venue ?? nearest ?? null;
}

// Name of what is at a point (a venue, an address or a street), or null if nothing is close.
async function reversePlace({ lat, lng }) {
  if (!env.openRouteServiceApiKey) throw providerError(503, 'Place search is not configured.');
  const url = new URL(`${env.openRouteServiceGeocodingBaseUrl.replace(/\/$/, '')}/reverse`);
  url.searchParams.set('point.lat', String(lat));
  url.searchParams.set('point.lon', String(lng));
  url.searchParams.set('size', '5');
  url.searchParams.set('layers', 'venue,address,street');
  url.searchParams.set('boundary.country', 'ESP');
  const chosen = chooseReverseFeature(await requestFeatures(url));
  // The name alone: the app only covers Zaragoza, so ", Zaragoza, Spain" would only fill the input.
  return chosen && { label: chosen.properties.name?.trim() || chosen.place.label };
}

module.exports = { autocompletePlaces, reversePlace };
