const request = require('supertest');

jest.mock('../api/middleware/requireAuth', () => ({
  requireAuth: (_req, _res, next) => next()
}));
jest.mock('../services/wind/windExposureService', () => ({
  getSegmentWindExposure: jest.fn()
}));

const { createApp } = require('../app');
const { getSegmentWindExposure } = require('../services/wind/windExposureService');

describe('GET /api/segments/:id/wind-exposure', () => {
  beforeEach(() => {
    getSegmentWindExposure.mockReset();
  });

  it('returns the exposure of the segment with the current wind', async () => {
    getSegmentWindExposure.mockResolvedValue({ segmentId: 5, windExposure: 42 });

    const response = await request(createApp()).get('/api/segments/5/wind-exposure');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ segmentId: 5, windExposure: 42 });
    expect(getSegmentWindExposure).toHaveBeenCalledWith(5, null);
  });

  it('passes the requested wind to the service', async () => {
    getSegmentWindExposure.mockResolvedValue({ segmentId: 5 });

    await request(createApp()).get('/api/segments/5/wind-exposure?windSpeed=30&windDirection=300');

    expect(getSegmentWindExposure).toHaveBeenCalledWith(5, { speedKmh: 30, directionDeg: 300 });
  });

  it.each([
    ['/api/segments/abc/wind-exposure', 'id'],
    ['/api/segments/5/wind-exposure?windSpeed=30', 'windDirection'],
    ['/api/segments/5/wind-exposure?windSpeed=30&windDirection=400', 'windDirection']
  ])('returns 400 for %s', async (path, field) => {
    const response = await request(createApp()).get(path);

    expect(response.status).toBe(400);
    expect(response.body.error.fields).toHaveProperty(field);
    expect(getSegmentWindExposure).not.toHaveBeenCalled();
  });

  it('returns the error status of the service', async () => {
    getSegmentWindExposure.mockRejectedValue(
      Object.assign(new Error('No existe el tramo indicado.'), { status: 404 })
    );

    const response = await request(createApp()).get('/api/segments/9/wind-exposure');

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('No existe el tramo indicado.');
  });
});
