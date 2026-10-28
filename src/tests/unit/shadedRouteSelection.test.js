const {
  MAX_DURATION_FACTOR,
  environmentalCost,
  selectShadedRoute
} = require('../../domain/routes/shadedRouteSelection');

const route = (id, duration, shadePercentage, status = 'available') => ({
  id,
  duration,
  exposure: {
    status,
    shadePercentage: status === 'available' ? shadePercentage : null,
    sunPercentage: status === 'available' ? 100 - shadePercentage : null
  }
});

describe('shaded route selection', () => {
  it('allows exposure to select a genuinely different, more shaded viable route', () => {
    const result = selectShadedRoute([route('fast', 600, 10), route('shade', 690, 80)]);

    expect(result).toMatchObject({
      status: 'selected',
      fastest: { id: 'fast' },
      shaded: { id: 'shade' },
      additionalDurationSeconds: 90,
      shadeImprovementPercentagePoints: 70
    });
    expect(environmentalCost(result.shaded)).toBeLessThan(environmentalCost(result.fastest));
  });

  it('rejects an excessively long route even when it is fully shaded', () => {
    const result = selectShadedRoute([
      route('fast', 600, 0),
      route('too-long', 600 * MAX_DURATION_FACTOR + 1, 100)
    ]);

    expect(result).toMatchObject({ status: 'no_better_alternative', shaded: null });
  });

  it('does not recolor the fastest route when no meaningful alternative exists', () => {
    expect(selectShadedRoute([route('fast', 600, 30)])).toMatchObject({
      status: 'no_better_alternative',
      fastest: { id: 'fast' },
      shaded: null
    });
    expect(selectShadedRoute([route('fast', 600, 30), route('similar', 610, 33)])).toMatchObject({
      status: 'no_better_alternative',
      shaded: null
    });
  });

  it('reports unavailable exposure on the fastest route', () => {
    expect(selectShadedRoute([route('fast', 600, 0, 'unavailable')])).toMatchObject({
      status: 'insufficient_exposure_data',
      shaded: null
    });
  });

  it('rejects an empty candidate list', () => {
    expect(() => selectShadedRoute([])).toThrow(/non-empty/);
  });
});
