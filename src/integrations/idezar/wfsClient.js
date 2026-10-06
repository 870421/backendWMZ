const { fetchJsonWithRetry } = require('../httpClient');

function buildGetFeatureUrl(baseUrl, { typeName, sortBy, count, startIndex }) {
  const url = new URL(baseUrl);
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    ...(sortBy && { sortBy }),
    ...(count !== undefined && { count: String(count), startIndex: String(startIndex) })
  }).toString();
  return url.toString();
}

/*
 * Yields WFS 2.0 pages ordered by `sortBy`, because GeoServer paging without a stable order can
 * repeat or skip features. sourceCount is the server's numberMatched for the whole layer.
 */
async function* fetchWfsPages({ baseUrl, typeName, sortBy, pageSize, requestOptions }) {
  let startIndex = 0;
  let sourceCount = null;
  for (;;) {
    const url = buildGetFeatureUrl(baseUrl, { typeName, sortBy, count: pageSize, startIndex });
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchJsonWithRetry(url, requestOptions);
    if (!Array.isArray(data?.features)) throw new Error(`Invalid WFS response for ${typeName}`);
    if (sourceCount === null && Number.isInteger(data.numberMatched)) {
      sourceCount = data.numberMatched;
    }
    yield { sourceCount, startIndex, items: data.features };
    startIndex += data.features.length;
    const reachedEnd = sourceCount !== null && startIndex >= sourceCount;
    if (data.features.length < pageSize || reachedEnd) return;
  }
}

module.exports = { buildGetFeatureUrl, fetchWfsPages };
