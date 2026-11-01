const request = require('supertest');

// Authentication is covered in auth.test.js; these tests focus on the endpoint itself.
jest.mock('../api/middleware/requireAuth', () => ({
  requireAuth: (_req, _res, next) => next()
}));

const { createApp } = require('../app');
const { env } = require('../config/env');

const feature = (label, layer, distance) => ({
  geometry: { type: 'Point', coordinates: [-0.88, 41.65] },
  properties: { gid: label, label, layer, distance }
});
const provider = (features) =>
  jest.fn().mockResolvedValue({ ok: true, json: async () => ({ features }) });
const reverse = (query = 'lat=41.65&lng=-0.88') =>
  request(createApp()).get(`/api/geocoding/reverse?${query}`);

describe('GET /api/geocoding/reverse', () => {
  const originalFetch = global.fetch;
  const originalKey = env.openRouteServiceApiKey;

  beforeEach(() => {
    env.openRouteServiceApiKey = 'test-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    env.openRouteServiceApiKey = originalKey;
  });

  it('names the point after the nearest result, whatever the provider order', async () => {
    global.fetch = provider([
      feature('Calle Lejana 1', 'address', 0.05),
      feature('Calle Cercana 3', 'address', 0.02)
    ]);

    const response = await reverse();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ place: { label: 'Calle Cercana 3' } });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url.pathname.endsWith('/reverse')).toBe(true);
    expect(url.searchParams.get('point.lat')).toBe('41.65');
    expect(url.searchParams.get('point.lon')).toBe('-0.88');
    expect(url.searchParams.get('layers')).toBe('venue,address,street');
    expect(url.searchParams.has('api_key')).toBe(false);
    expect(options.headers.Authorization).toBe('test-key');
  });

  it('prefers a venue clicked on over the address of its building', async () => {
    global.fetch = provider([
      feature('Calle Mayor 1', 'address', 0.008),
      feature('Restaurante El Pilar', 'venue', 0.012)
    ]);

    expect((await reverse()).body.place.label).toBe('Restaurante El Pilar');
  });

  it('uses the name without the city when the provider gives one', async () => {
    const place = feature('Calle Mayor 1, Zaragoza, Spain', 'address', 0.02);
    place.properties.name = 'Calle Mayor 1';
    global.fetch = provider([place]);

    expect((await reverse()).body).toEqual({ place: { label: 'Calle Mayor 1' } });
  });

  it('does not prefer a venue that is farther away', async () => {
    global.fetch = provider([
      feature('Bar Lejano', 'venue', 0.04),
      feature('Calle Mayor 1', 'address', 0.02)
    ]);

    expect((await reverse()).body.place.label).toBe('Calle Mayor 1');
  });

  it.each([
    ['nothing is close', [feature('Parque Lejano', 'venue', 0.151)]],
    ['there are no results', []],
    ['a result has no distance', [feature('Sin distancia', 'venue', undefined)]]
  ])('returns no name when %s', async (_case, features) => {
    global.fetch = provider(features);

    const response = await reverse();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ place: null });
  });

  it.each([
    'lng=-0.88',
    'lat=41.65',
    'lat=&lng=',
    'lat=abc&lng=-0.88',
    'lat=41.65&lat=41.66&lng=-0.88',
    'lat=40.4168&lng=-3.7038'
  ])('rejects %s without calling the provider', async (query) => {
    const response = await reverse(query);

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when the API key is not configured', async () => {
    env.openRouteServiceApiKey = '';

    expect((await reverse()).status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [429, 429],
    [500, 502]
  ])('maps provider status %s to %s without exposing details', async (status, expected) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status });

    const response = await reverse();

    expect(response.status).toBe(expected);
    expect(JSON.stringify(response.body)).not.toContain('test-key');
  });
});
