const { calculateWindExposure } = require('../../domain/wind/windExposure');
const defaultSegments = require('../../repositories/segmentRepository');
const { httpError } = require('../../utils/httpError');
const { getZaragozaWeather } = require('../weather/weatherService');

async function resolveWind(override, weather) {
  if (override) return { ...override, source: 'request', time: null };
  const current = await weather();
  return {
    speedKmh: current.windSpeed,
    directionDeg: current.windDirection,
    source: 'open-meteo',
    time: current.time
  };
}

/*
 * Wind exposure of one segment (ADR-024). Without an override it uses the current Open-Meteo
 * wind of PBI-7, which is cached for five minutes.
 */
async function getSegmentWindExposure(
  segmentId,
  override,
  { segments = defaultSegments, weather = getZaragozaWeather } = {}
) {
  const segment = await segments.getSegmentById(segmentId);
  if (!segment) throw httpError(404, 'No existe el tramo indicado.');

  const [wind, pieces] = await Promise.all([
    resolveWind(override, weather),
    segments.getSegmentPieces(segmentId)
  ]);
  return {
    segmentId,
    segmentSourceId: segment.sourceId,
    name: segment.name,
    lengthM: segment.lengthM,
    wind,
    ...calculateWindExposure(pieces, wind)
  };
}

module.exports = { getSegmentWindExposure };
