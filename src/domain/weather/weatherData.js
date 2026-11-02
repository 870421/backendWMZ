function normalizeCurrentWeather(payload) {
  const current = payload?.current;
  const units = payload?.current_units;
  const temperature = current?.temperature_2m;
  const windSpeed = current?.wind_speed_10m;
  const windDirection = current?.wind_direction_10m;
  const time = current?.time;

  if (
    !Number.isFinite(temperature) ||
    !Number.isFinite(windSpeed) ||
    !Number.isFinite(windDirection) ||
    windDirection < 0 ||
    windDirection > 360 ||
    typeof time !== 'string' ||
    !Number.isFinite(Date.parse(time))
  ) {
    throw Object.assign(new Error('Invalid weather provider response.'), { status: 502 });
  }

  return {
    temperature,
    temperatureUnit: units?.temperature_2m || '°C',
    windSpeed,
    windSpeedUnit: units?.wind_speed_10m || 'km/h',
    windDirection,
    windDirectionUnit: units?.wind_direction_10m || '°',
    time,
    timeZone: payload.timezone || 'Europe/Madrid'
  };
}

module.exports = { normalizeCurrentWeather };
