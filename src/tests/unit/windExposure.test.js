const {
  MAX_WIND_SPEED_KMH,
  MIN_WIND_SPEED_KMH,
  calculateWindExposure,
  parseWindOverride,
  streetOrientation,
  windAlignment,
  windIntensity
} = require('../../domain/wind/windExposure');

const street = (bearingDeg, lengthM = 100) => [{ bearingDeg, lengthM }];

describe('windIntensity', () => {
  it.each([
    [0, 0],
    [MIN_WIND_SPEED_KMH, 0],
    [30, 0.5],
    [MAX_WIND_SPEED_KMH, 1],
    [80, 1]
  ])('maps %s km/h to %s', (speed, expected) => {
    expect(windIntensity(speed)).toBeCloseTo(expected);
  });
});

describe('windAlignment', () => {
  it('scores aligned above diagonal above perpendicular streets', () => {
    const aligned = windAlignment(street(90), 90);
    const diagonal = windAlignment(street(45), 90);
    const perpendicular = windAlignment(street(0), 90);

    expect(aligned).toBeCloseTo(1);
    expect(diagonal).toBeCloseTo(Math.SQRT1_2);
    expect(perpendicular).toBeCloseTo(0);
  });

  it('treats the street as an axis: wind from either end scores the same', () => {
    expect(windAlignment(street(300), 120)).toBeCloseTo(1);
    expect(windAlignment(street(120), 300)).toBeCloseTo(windAlignment(street(120), 120));
  });

  it('weights each straight piece of a curved segment by its length', () => {
    const lShape = [
      { bearingDeg: 90, lengthM: 75 },
      { bearingDeg: 0, lengthM: 25 }
    ];

    expect(windAlignment(lShape, 90)).toBeCloseTo(0.75);
  });

  it('ignores invalid pieces and returns null without usable geometry', () => {
    expect(windAlignment([{ bearingDeg: null, lengthM: 10 }, ...street(90)], 90)).toBeCloseTo(1);
    expect(windAlignment([], 90)).toBeNull();
    expect(windAlignment([{ bearingDeg: 90, lengthM: 0 }], 90)).toBeNull();
  });
});

describe('streetOrientation', () => {
  it('returns the axis between 0 and 180 degrees', () => {
    expect(streetOrientation(street(270))).toBeCloseTo(90);
    expect(streetOrientation(street(45))).toBeCloseTo(45);
  });

  it('does not cancel out opposite bearings of the same axis', () => {
    expect(streetOrientation([...street(10), ...street(190)])).toBeCloseTo(10);
  });

  it('returns null when no axis dominates', () => {
    expect(streetOrientation([...street(0), ...street(90)])).toBeNull();
    expect(streetOrientation([])).toBeNull();
  });
});

describe('calculateWindExposure', () => {
  it('combines alignment and intensity into a 0-100 score', () => {
    const result = calculateWindExposure(street(120), { speedKmh: 30, directionDeg: 300 });

    expect(result).toMatchObject({ status: 'available', reason: null });
    expect(result.orientationDeg).toBeCloseTo(120);
    expect(result.alignment).toBeCloseTo(1);
    expect(result.intensity).toBeCloseTo(0.5);
    expect(result.windExposure).toBeCloseTo(50);
  });

  it('returns 0 with calm wind even on an aligned street', () => {
    const result = calculateWindExposure(street(90), { speedKmh: 5, directionDeg: 90 });

    expect(result.windExposure).toBe(0);
  });

  it('reports an unavailable exposure without usable geometry', () => {
    expect(calculateWindExposure([], { speedKmh: 30, directionDeg: 90 })).toEqual({
      status: 'unavailable',
      reason: 'invalid_segment_geometry',
      orientationDeg: null,
      alignment: null,
      intensity: null,
      windExposure: null
    });
  });
});

describe('parseWindOverride', () => {
  it('returns null without wind parameters', () => {
    expect(parseWindOverride({})).toBeNull();
    expect(parseWindOverride()).toBeNull();
  });

  it('parses both values', () => {
    expect(parseWindOverride({ windSpeed: '35.5', windDirection: '300' })).toEqual({
      speedKmh: 35.5,
      directionDeg: 300
    });
  });

  it.each([
    [{ windSpeed: '30' }, 'windDirection'],
    [{ windDirection: '90' }, 'windSpeed'],
    [{ windSpeed: 'abc', windDirection: '90' }, 'windSpeed'],
    [{ windSpeed: '', windDirection: '90' }, 'windSpeed'],
    [{ windSpeed: '-1', windDirection: '90' }, 'windSpeed'],
    [{ windSpeed: '201', windDirection: '90' }, 'windSpeed'],
    [{ windSpeed: '30', windDirection: '361' }, 'windDirection'],
    [{ windSpeed: '30', windDirection: ['90', '180'] }, 'windDirection']
  ])('rejects %j with a 400 on %s', (query, field) => {
    expect(() => parseWindOverride(query)).toThrow(
      expect.objectContaining({ status: 400, fields: { [field]: expect.any(String) } })
    );
  });
});
