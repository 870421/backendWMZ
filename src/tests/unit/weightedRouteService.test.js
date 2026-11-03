const { calculateWeightedRouteComparison } = require('../../services/routing/weightedRouteService');

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
  aboveHorizon: true
};

describe('weighted route service', () => {
  const routesProvider = jest.fn();
  const findSegmentsForRoutes = jest.fn();
  const exposureCalculator = jest.fn();
  const solarCalculator = jest.fn();
  const fastestRouteCalculator = jest.fn();
  const dependencies = {
    alternativesProvider: routesProvider,
    routeSegmentRepository: { findSegmentsForRoutes },
    exposureCalculator,
    solarCalculator,
    fastestRouteCalculator
  };

  beforeEach(() => {
    jest.clearAllMocks();
    solarCalculator.mockReturnValue(solarPosition);
    // A sunny fastest route and a shaded alternative 10 % longer.
    routesProvider.mockResolvedValue([
      { geometry: geometry(), distance: 1000, duration: 600 },
      { geometry: geometry(0.001), distance: 1100, duration: 660 }
    ]);
    findSegmentsForRoutes.mockResolvedValue([
      { routeIndex: 0, segmentId: 1, overlapLengthM: 1000 },
      { routeIndex: 1, segmentId: 2, overlapLengthM: 1100 }
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

  it('chooses the alternative that suits the weights', async () => {
    const result = await calculateWeightedRouteComparison(
      { ...input, weights: { shade: 50, sun: 0 } },
      dependencies
    );

    expect(result).toMatchObject({
      status: 'selected',
      weights: { shade: 50, sun: 0 },
      fastest: { duration: 600 },
      selected: { duration: 660 },
      additionalDurationSeconds: 60,
      candidatesEvaluated: 2,
      strategy: { maximumDurationFactor: 1.25, minimumImprovementPercentagePoints: 5 }
    });
    expect(result.shadeChangePercentagePoints).toBeCloseTo(70);
    expect(exposureCalculator).toHaveBeenCalledTimes(1);
    // Up to 25 %, ORS is asked exactly as for the Shaded Route.
    expect(routesProvider).toHaveBeenCalledWith(expect.any(Object), { weightFactor: 1.25 });
  });

  it('only accepts the extra time chosen by the user', async () => {
    const result = await calculateWeightedRouteComparison(
      { ...input, weights: { shade: 50, sun: 0 }, maxDetourPercentage: 5 },
      dependencies
    );

    expect(result).toMatchObject({
      status: 'no_better_alternative',
      strategy: { maximumDurationFactor: 1.05 }
    });
  });

  it('asks ORS for longer alternatives when the user accepts more time', async () => {
    await calculateWeightedRouteComparison(
      { ...input, weights: { shade: 50, sun: 0 }, maxDetourPercentage: 40 },
      dependencies
    );

    expect(routesProvider).toHaveBeenCalledWith(expect.any(Object), { weightFactor: 1.4 });
  });

  it('keeps the fastest route when the weights favour what it already has', async () => {
    const result = await calculateWeightedRouteComparison(
      { ...input, weights: { shade: 0, sun: 50 } },
      dependencies
    );

    expect(result).toMatchObject({ status: 'no_better_alternative', selected: null });
  });

  it('only asks for the fastest route when every weight is 0', async () => {
    fastestRouteCalculator.mockResolvedValue({ distance: 1000, duration: 600 });

    const result = await calculateWeightedRouteComparison(
      { ...input, weights: { shade: 0, sun: 0 } },
      dependencies
    );

    expect(result).toMatchObject({
      status: 'fastest_only',
      fastest: { duration: 600 },
      selected: null
    });
    expect(routesProvider).not.toHaveBeenCalled();
    expect(exposureCalculator).not.toHaveBeenCalled();
  });

  it('explains why there are no shadows', async () => {
    exposureCalculator.mockResolvedValue({ status: 'sun_too_low', reference: solarPosition });

    const result = await calculateWeightedRouteComparison(
      { ...input, weights: { shade: 50, sun: 0 } },
      dependencies
    );

    expect(result).toMatchObject({ status: 'sun_too_low', selected: null });
  });

  it('rejects invalid weights before spending provider quota', async () => {
    await expect(
      calculateWeightedRouteComparison({ ...input, weights: { shade: 200 } }, dependencies)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calculateWeightedRouteComparison(
        { ...input, weights: { shade: 50 }, maxDetourPercentage: 80 },
        dependencies
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(routesProvider).not.toHaveBeenCalled();
    expect(fastestRouteCalculator).not.toHaveBeenCalled();
  });
});
