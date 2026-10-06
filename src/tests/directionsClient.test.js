const { env } = require('../config/env');
const { getFastestWalkingRoute } = require('../integrations/openRouteService/directionsClient');

describe('OpenRouteService directions adapter', () => {
  const originalFetch = global.fetch;
  const originalApiKey = env.openRouteServiceApiKey;
  const originalBaseUrl = env.openRouteServiceDirectionsBaseUrl;
  const origin = { lat: 41.6488, lng: -0.8891 };
  const destination = { lat: 41.656, lng: -0.878 };

  beforeEach(() => {
    env.openRouteServiceApiKey = 'test-key';
    env.openRouteServiceDirectionsBaseUrl = 'https://routing.example/v2/directions/';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    env.openRouteServiceApiKey = originalApiKey;
    env.openRouteServiceDirectionsBaseUrl = originalBaseUrl;
    jest.useRealTimers();
  });

  it('requests and normalizes the fastest walking route', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[-0.8891, 41.6488], [-0.884, 41.652], [-0.878, 41.656]]
          },
          properties: { summary: { distance: 1250.4, duration: 930.2 } }
        }]
      })
    });

    await expect(getFastestWalkingRoute({ origin, destination })).resolves.toEqual({
      geometry: {
        type: 'LineString',
        coordinates: [[-0.8891, 41.6488], [-0.884, 41.652], [-0.878, 41.656]]
      },
      distance: 1250.4,
      duration: 930.2
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://routing.example/v2/directions/foot-walking/geojson');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('test-key');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({
      coordinates: [[-0.8891, 41.6488], [-0.878, 41.656]],
      preference: 'fastest',
      instructions: false
    }));
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects invalid coordinates before calling the provider', async () => {
    await expect(getFastestWalkingRoute({
      origin: { lat: 100, lng: -0.8891 }, destination
    })).rejects.toMatchObject({ status: 400, message: 'Route coordinates are invalid.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a controlled error when routing is not configured', async () => {
    env.openRouteServiceApiKey = '';
    await expect(getFastestWalkingRoute({ origin, destination })).rejects.toMatchObject({
      status: 503,
      message: 'Route calculation is not configured.'
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 502, 'Route provider is unavailable.'],
    [403, 502, 'Route provider is unavailable.'],
    [429, 429, 'Route provider quota has been exceeded. Please try again shortly.'],
    [500, 502, 'Route provider is unavailable.']
  ])('maps provider status %s to controlled status %s', async (providerStatus, status, message) => {
    const json = jest.fn(async () => ({ sensitive: 'provider body' }));
    global.fetch.mockResolvedValue({ ok: false, status: providerStatus, json });

    await expect(getFastestWalkingRoute({ origin, destination })).rejects.toMatchObject({ status, message });
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { type: 'FeatureCollection', features: [] },
    { type: 'FeatureCollection', features: [{}] },
    {
      type: 'FeatureCollection',
      features: [{
        geometry: { type: 'Point', coordinates: [-0.8891, 41.6488] },
        properties: { summary: { distance: 1, duration: 1 } }
      }]
    },
    {
      type: 'FeatureCollection',
      features: [{
        geometry: { type: 'LineString', coordinates: [[-0.8891, 41.6488], ['bad', 41.656]] },
        properties: { summary: { distance: 1, duration: 1 } }
      }]
    },
    {
      type: 'FeatureCollection',
      features: [{
        geometry: { type: 'LineString', coordinates: [[-0.8891, 41.6488], [-0.878, 41.656]] },
        properties: { summary: { distance: -1, duration: 1 } }
      }]
    },
    {
      type: 'FeatureCollection',
      features: [{
        geometry: { type: 'LineString', coordinates: [[-0.8891, 41.6488], [-0.878, 41.656]] },
        properties: { summary: { distance: 1 } }
      }]
    }
  ])('rejects malformed provider data without exposing it', async (body) => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => body });
    await expect(getFastestWalkingRoute({ origin, destination })).rejects.toMatchObject({
      status: 502,
      message: 'Invalid route provider response.'
    });
  });

  it('hides network and response parsing details', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('test-key and sensitive provider details'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('sensitive invalid JSON'); }
      });

    await expect(getFastestWalkingRoute({ origin, destination })).rejects.toMatchObject({
      status: 502,
      message: 'Route provider is unavailable.'
    });
    await expect(getFastestWalkingRoute({ origin, destination })).rejects.toMatchObject({
      status: 502,
      message: 'Route provider is unavailable.'
    });
  });

  it('aborts slow provider calls', async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));

    const result = getFastestWalkingRoute({ origin, destination });
    const assertion = expect(result).rejects.toMatchObject({
      status: 504,
      message: 'Route calculation timed out. Please try again.'
    });
    await jest.advanceTimersByTimeAsync(8000);
    await assertion;
  });
});
