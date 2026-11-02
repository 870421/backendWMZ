const { normalizeCurrentWeather } = require('../../domain/weather/weatherData');

describe('normalizeCurrentWeather', () => {
  it('normalizes current Zaragoza weather and units', () => {
    expect(
      normalizeCurrentWeather({
        timezone: 'Europe/Madrid',
        current: {
          temperature_2m: 21.4,
          wind_speed_10m: 12.2,
          wind_direction_10m: 275,
          time: '2026-11-02T15:00'
        },
        current_units: {
          temperature_2m: '°C',
          wind_speed_10m: 'km/h',
          wind_direction_10m: '°'
        }
      })
    ).toEqual({
      temperature: 21.4,
      temperatureUnit: '°C',
      windSpeed: 12.2,
      windSpeedUnit: 'km/h',
      windDirection: 275,
      windDirectionUnit: '°',
      time: '2026-11-02T15:00',
      timeZone: 'Europe/Madrid'
    });
  });

  it('rejects missing or invalid weather values', () => {
    expect(() => normalizeCurrentWeather({ current: {} })).toThrow(
      'Invalid weather provider response.'
    );
  });
});
