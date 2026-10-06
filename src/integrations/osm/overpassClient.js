const { fetchJsonWithRetry } = require('../httpClient');

async function runOverpassQuery(overpassUrl, query, requestOptions = {}) {
  const data = await fetchJsonWithRetry(overpassUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'WeatherMapZ-backend (university project)'
    },
    body: new URLSearchParams({ data: query }).toString(),
    timeoutMs: 360000,
    ...requestOptions
  });
  if (!Array.isArray(data?.elements)) throw new Error('Invalid Overpass response');
  return data.elements;
}

module.exports = { runOverpassQuery };
