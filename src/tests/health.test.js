const request = require('supertest');

const { createApp } = require('../app');

describe('GET /api/health', () => {
  it('returns the backend health status', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'weathermapz-backend'
    });
  });
});
