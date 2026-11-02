const { normalizeCurrentWeather } = require('../../domain/weather/weatherData');
const { getCurrentWeather } = require('../../integrations/openMeteo/weatherClient');

const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
let cacheEntry = null;
let pendingRequest = null;

async function getZaragozaWeather({ now = Date.now(), provider = getCurrentWeather } = {}) {
  if (cacheEntry && cacheEntry.expiresAt > now) return cacheEntry.value;
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const weather = normalizeCurrentWeather(await provider());
    const value = { ...weather, fetchedAt: new Date().toISOString() };
    cacheEntry = { value, expiresAt: now + WEATHER_CACHE_TTL_MS };
    return value;
  })();

  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}

function clearWeatherCache() {
  cacheEntry = null;
  pendingRequest = null;
}

module.exports = { WEATHER_CACHE_TTL_MS, clearWeatherCache, getZaragozaWeather };
