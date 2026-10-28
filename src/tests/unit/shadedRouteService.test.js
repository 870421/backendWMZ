const { calculateShadedRouteComparison } = require('../../services/routing/shadedRouteService');

const geometry = (offset = 0) => ({
  type: 'LineString',
  coordinates: [
    [-0.889 + offset, 41.6488],
    [-0.878 + offset, 41.656]
  ]
});

const input = {
  origin: { lat: 41.6488, lng: -0.8891 },
  destination: { lat: 41.656, lng: -0.878 },
  date: '2026-06-21',
  time: '14:00',
  timeZone: 'Europe/Madrid'
};

const solarPosition = {
  instant: '2026-06-21T12:00:00Z',
  localDateTime: '2026-06-21T14:00:00+02:00',
  timeZone: 'Europe/Madrid',
  latitude: 41.6488,
  longitude: -0.8891,
  azimuthDegrees: 176,
  elevationDegrees: 72,
  aboveHorizon: true
};

describe('shaded route service', () => {
  const routesProvider = jest.fn();
  const findSegmentsForRoutes = jest.fn();
  const exposureCalculator = jest.fn();
  const solarCalculator = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    solarCalculator.mockReturnValue(solarPosition);
    routesProvider.mockResolvedValue([
      { geometry: geometry(), distance: 1000, duration: 600 },
      { geometry: geometry(0.001), distance: 1100, duration: 660 }
    ]);
    findSegmentsForRoutes.mockResolvedValue([
      { routeIndex: 0, segmentId: 1, overlapLengthM: 900 },
      { routeIndex: 1, segmentId: 2, overlapLengthM: 1000 }
    ]);
    exposureCalculator.mockResolvedValue({
      status: 'calculated',
      reference: solarPosition,
      segments: [
        { segmentId: 1, status: 'available', shadeRatio: 0.1 },
        { segmentId: 2, status: 'available', shadeRatio: 0.8 }
      ]
    });
  });

  it('evaluates all candidates with one mapping and one exposure calculation', async () => {
    const result = await calculateShadedRouteComparison(input, {
      routesProvider,
      routeSegmentRepository: { findSegmentsForRoutes },
      exposureCalculator,
      solarCalculator
    });

    expect(result).toMatchObject({
      status: 'selected',
      fastest: { routeIndex: 0, exposure: { shadePercentage: 10 } },
      shaded: { routeIndex: 1, exposure: { shadePercentage: 80 } },
      additionalDurationSeconds: 60,
      candidatesEvaluated: 2
    });
    expect(findSegmentsForRoutes).toHaveBeenCalledTimes(1);
    expect(exposureCalculator).toHaveBeenCalledTimes(1);
    expect(exposureCalculator).toHaveBeenCalledWith(
      expect.objectContaining({ segmentIds: [1, 2], date: input.date, time: input.time })
    );
  });

  it('reports missing local segment data without calling the shadow query', async () => {
    findSegmentsForRoutes.mockResolvedValue([]);

    const result = await calculateShadedRouteComparison(input, {
      routesProvider,
      routeSegmentRepository: { findSegmentsForRoutes },
      exposureCalculator,
      solarCalculator
    });

    expect(result.status).toBe('insufficient_exposure_data');
    expect(result.shaded).toBeNull();
    expect(exposureCalculator).not.toHaveBeenCalled();
  });

  it('reports night explicitly', async () => {
    exposureCalculator.mockResolvedValue({
      status: 'sun_below_horizon',
      reference: solarPosition,
      segments: [
        { segmentId: 1, status: 'unavailable' },
        { segmentId: 2, status: 'unavailable' }
      ]
    });

    const result = await calculateShadedRouteComparison(input, {
      routesProvider,
      routeSegmentRepository: { findSegmentsForRoutes },
      exposureCalculator,
      solarCalculator
    });

    expect(result).toMatchObject({ status: 'sun_below_horizon', shaded: null });
  });

  it.each([
    [{ ...input, origin: null }, /Origin and destination/],
    [{ ...input, date: 'not-a-date' }, /Date, time and time zone/]
  ])('validates the request before calling ORS', async (invalidInput, message) => {
    await expect(
      calculateShadedRouteComparison(invalidInput, {
        routesProvider,
        routeSegmentRepository: { findSegmentsForRoutes },
        exposureCalculator,
        solarCalculator
      })
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
    expect(routesProvider).not.toHaveBeenCalled();
  });
});
