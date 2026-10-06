const request = require('supertest');

jest.mock('../integrations/openRouteService/directionsClient', () => ({
  getFastestWalkingRoute: jest.fn()
}));

const { createApp } = require('../app');
const { getFastestWalkingRoute } = require('../integrations/openRouteService/directionsClient');

describe('POST /api/routes/fastest', () => {
  const origin = { lat: 41.6488, lng: -0.8891 };
  const destination = { lat: 41.656, lng: -0.878 };
  const route = {
    geometry: {
      type: 'LineString',
      coordinates: [[-0.8891, 41.6488], [-0.884, 41.652], [-0.878, 41.656]]
    },
    distance: 1250.4,
    duration: 930.2
  };

  beforeEach(() => {
    getFastestWalkingRoute.mockReset();
  });

  it('returns the normalized fastest walking route', async () => {
    getFastestWalkingRoute.mockResolvedValue(route);

    const response = await request(createApp())
      .post('/api/routes/fastest')
      .send({ origin, destination });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ route });
    expect(getFastestWalkingRoute).toHaveBeenCalledTimes(1);
    expect(getFastestWalkingRoute).toHaveBeenCalledWith({ origin, destination });
  });

  it.each([
    undefined,
    {},
    { origin },
    { destination },
    { origin: null, destination },
    { origin: [], destination },
    { origin: { lat: '41.6488', lng: -0.8891 }, destination },
    { origin: { lat: 91, lng: -0.8891 }, destination },
    { origin, destination: { lat: 41.656, lng: -181 } }
  ])('returns 400 for invalid coordinates %#', async (body) => {
    let pendingRequest = request(createApp()).post('/api/routes/fastest');
    if (body !== undefined) pendingRequest = pendingRequest.send(body);
    const response = await pendingRequest;

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        message: 'Origin and destination must contain valid latitude and longitude coordinates.'
      }
    });
    expect(getFastestWalkingRoute).not.toHaveBeenCalled();
  });

  it('preserves controlled provider errors', async () => {
    getFastestWalkingRoute.mockRejectedValue(Object.assign(
      new Error('Route calculation timed out. Please try again.'),
      { status: 504 }
    ));

    const response = await request(createApp())
      .post('/api/routes/fastest')
      .send({ origin, destination });

    expect(response.status).toBe(504);
    expect(response.body).toEqual({
      error: { message: 'Route calculation timed out. Please try again.' }
    });
  });
});
