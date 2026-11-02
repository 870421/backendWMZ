const { normalizeCurrentWeather } = require('../../domain/weather/weatherData');
const {
  clearWeatherCache,
  getZaragozaWeather,
  WEATHER_CACHE_TTL_MS
} = require('../../services/weather/weatherService');

const providerData = {
  timezone: 'Europe/Madrid',
  current: {
    temperature_2m: 21,
    wind_speed_10m: 9,
    wind_direction_10m: 180,
    time: '2026-11-02T15:00'
  }
};

describe('weatherService', () => {
  beforeEach(clearWeatherCache);

  it('reuses cached weather and refreshes it after five minutes', async () => {
    const provider = jest.fn().mockResolvedValue(providerData);
    const first = await getZaragozaWeather({ now: 1000, provider });
    const cached = await getZaragozaWeather({ now: 1000 + WEATHER_CACHE_TTL_MS - 1, provider });
    await getZaragozaWeather({ now: 1000 + WEATHER_CACHE_TTL_MS, provider });

    expect(cached).toBe(first);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight provider request between concurrent calls', async () => {
    let finish;
    const provider = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = getZaragozaWeather({ provider });
    const second = getZaragozaWeather({ provider });
    finish(providerData);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('does not cache provider failures', async () => {
    const provider = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(providerData);
    await expect(getZaragozaWeather({ provider })).rejects.toThrow('offline');
    await expect(getZaragozaWeather({ provider })).resolves.toMatchObject({ temperature: 21 });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('normalizes before caching', async () => {
    const result = await getZaragozaWeather({ provider: async () => providerData });
    expect(result).toMatchObject(normalizeCurrentWeather(providerData));
    expect(result.fetchedAt).toEqual(expect.any(String));
  });
});
