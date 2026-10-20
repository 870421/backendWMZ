const {
  shadowFactors,
  shadowVectorForHeight,
  validateSegmentIds
} = require('../../domain/shadow/shadowProjection');

describe('shadow projection geometry', () => {
  it('projects a 45-degree eastern sun towards the west with the object height as length', () => {
    const vector = shadowVectorForHeight({
      azimuthDegrees: 90,
      elevationDegrees: 45,
      heightM: 10
    });

    expect(vector.lengthM).toBeCloseTo(10, 10);
    expect(vector.eastM).toBeCloseTo(-10, 10);
    expect(vector.northM).toBeCloseTo(0, 10);
  });

  it('projects a southern sun towards the north and scales with height', () => {
    const vector = shadowVectorForHeight({
      azimuthDegrees: 180,
      elevationDegrees: 30,
      heightM: 12
    });

    expect(vector.lengthM).toBeCloseTo(20.7846, 4);
    expect(vector.eastM).toBeCloseTo(0, 10);
    expect(vector.northM).toBeCloseTo(20.7846, 4);
    expect(shadowFactors({ azimuthDegrees: 180, elevationDegrees: 45 })).toMatchObject({
      lengthPerHeight: expect.closeTo(1, 10),
      eastPerHeight: expect.closeTo(0, 10),
      northPerHeight: expect.closeTo(1, 10)
    });
  });

  it('does not project a shadow while the sun is on or below the horizon', () => {
    expect(
      shadowVectorForHeight({ azimuthDegrees: 200, elevationDegrees: 0, heightM: 10 })
    ).toBeNull();
    expect(shadowFactors({ azimuthDegrees: 20, elevationDegrees: -5 })).toBeNull();
  });

  it.each([
    [{ azimuthDegrees: -1, elevationDegrees: 20, heightM: 1 }, /azimuth/],
    [{ azimuthDegrees: 360, elevationDegrees: 20, heightM: 1 }, /azimuth/],
    [{ azimuthDegrees: 20, elevationDegrees: 91, heightM: 1 }, /elevation/],
    [{ azimuthDegrees: 20, elevationDegrees: 20, heightM: 0 }, /heightM/]
  ])('rejects invalid projection input %#', (input, message) => {
    expect(() => shadowVectorForHeight(input)).toThrow(message);
  });

  it('validates and deduplicates database segment identifiers', () => {
    expect(validateSegmentIds([3, 1, 3])).toEqual([3, 1]);
    expect(() => validateSegmentIds([])).toThrow(/non-empty/);
    expect(() => validateSegmentIds([1, '2'])).toThrow(/positive integer/);
    expect(() => validateSegmentIds([0])).toThrow(/positive integer/);
  });
});
