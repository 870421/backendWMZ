const {
  MIN_EXPOSURE_COVERAGE_RATIO,
  calculateRouteExposure
} = require('../../domain/routes/routeExposure');

describe('route exposure', () => {
  it('weights segment shade by covered length instead of averaging percentages', () => {
    const exposures = new Map([
      [1, { status: 'available', shadeRatio: 1 }],
      [2, { status: 'available', shadeRatio: 0 }]
    ]);

    const result = calculateRouteExposure(
      { distance: 100 },
      [
        { segmentId: 1, overlapLengthM: 80 },
        { segmentId: 2, overlapLengthM: 20 }
      ],
      exposures
    );

    expect(result).toMatchObject({
      status: 'available',
      shadePercentage: 80,
      sunPercentage: 20,
      coveragePercentage: 100
    });
  });

  it('reports insufficient mapped exposure explicitly', () => {
    const result = calculateRouteExposure(
      { distance: 100 },
      [{ segmentId: 1, overlapLengthM: 70 }],
      new Map([[1, { status: 'available', shadeRatio: 0.5 }]])
    );

    expect(MIN_EXPOSURE_COVERAGE_RATIO).toBe(0.8);
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'insufficient_segment_coverage',
      coveragePercentage: 70,
      shadePercentage: null
    });
  });

  it('ignores invalid lengths and unavailable segment exposure', () => {
    const result = calculateRouteExposure(
      { distance: 10 },
      [
        { segmentId: 1, overlapLengthM: Number.NaN },
        { segmentId: 2, overlapLengthM: 10 }
      ],
      new Map([
        [1, { status: 'available', shadeRatio: 1 }],
        [2, { status: 'unavailable', shadeRatio: null }]
      ])
    );

    expect(result).toMatchObject({ status: 'unavailable', coveragePercentage: 0 });
  });

  it.each([0, -1, Number.NaN])('rejects invalid route distance %s as unavailable', (distance) => {
    expect(calculateRouteExposure({ distance }, [], new Map())).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_route_distance'
    });
  });
});
