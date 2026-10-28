const request = require('supertest');

jest.mock('../api/middleware/requireAuth', () => ({
  requireAuth: (_req, _res, next) => next()
}));

jest.mock('../services/routing/shadedRouteService', () => ({
  calculateShadedRouteComparison: jest.fn()
}));

const { createApp } = require('../app');
const { calculateShadedRouteComparison } = require('../services/routing/shadedRouteService');

describe('POST /api/routes/shaded', () => {
  const body = {
    origin: { lat: 41.6488, lng: -0.8891 },
    destination: { lat: 41.656, lng: -0.878 },
    date: '2026-06-21',
    time: '14:00',
    timeZone: 'Europe/Madrid'
  };
  const comparison = {
    status: 'selected',
    fastest: { distance: 1000, duration: 600 },
    shaded: { distance: 1100, duration: 660 },
    additionalDurationSeconds: 60
  };

  beforeEach(() => calculateShadedRouteComparison.mockReset());

  it('returns the shaded route comparison', async () => {
    calculateShadedRouteComparison.mockResolvedValue(comparison);

    const response = await request(createApp()).post('/api/routes/shaded').send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ comparison });
    expect(calculateShadedRouteComparison).toHaveBeenCalledWith(body);
  });

  it.each([400, 429, 502, 503, 504])('preserves controlled error %s', async (status) => {
    calculateShadedRouteComparison.mockRejectedValue(
      Object.assign(new Error('Controlled route error'), { status })
    );

    const response = await request(createApp()).post('/api/routes/shaded').send(body);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { message: 'Controlled route error' } });
  });
});
