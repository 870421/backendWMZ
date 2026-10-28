const {
  calculateSegmentExposure,
  unavailableExposure
} = require('../../domain/shadow/segmentExposure');

describe('segment solar exposure', () => {
  it.each([
    [0, 0, 100],
    [40, 40, 60],
    [100, 100, 0]
  ])('calculates %s%% shade and complementary sun', (shadedLengthM, shade, sun) => {
    expect(
      calculateSegmentExposure({
        segmentId: 7,
        segmentSourceId: 'osm:7',
        segmentLengthM: 100,
        shadedLengthM
      })
    ).toMatchObject({
      status: 'available',
      shadePercentage: shade,
      sunPercentage: sun,
      shadeRatio: shade / 100
    });
  });

  it('uses the unioned shaded length instead of summing overlapping associations', () => {
    const exposure = calculateSegmentExposure({
      segmentId: 8,
      segmentLengthM: 100,
      shadedLengthM: 60,
      associations: [{ shadedLengthM: 40 }, { shadedLengthM: 40 }]
    });

    expect(exposure.shadedLengthM).toBe(60);
    expect(exposure.shadePercentage).toBe(60);
  });

  it.each([
    [-10, 0, 0, 100],
    [120, 100, 100, 0]
  ])('clamps shaded length %s to the segment bounds', (input, length, shade, sun) => {
    const exposure = calculateSegmentExposure({
      segmentId: 9,
      segmentLengthM: 100,
      shadedLengthM: input
    });

    expect(exposure.shadedLengthM).toBe(length);
    expect(exposure.shadePercentage).toBe(shade);
    expect(exposure.sunPercentage).toBe(sun);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'reports an invalid total length %s as unavailable',
    (segmentLengthM) => {
      expect(calculateSegmentExposure({ segmentId: 10, segmentLengthM, shadedLengthM: 0 })).toEqual(
        unavailableExposure(10, 'invalid_segment_length')
      );
    }
  );

  it('reports an invalid shaded length and rejects invalid identifiers', () => {
    expect(
      calculateSegmentExposure({ segmentId: 11, segmentLengthM: 20, shadedLengthM: Number.NaN })
    ).toEqual(unavailableExposure(11, 'invalid_shaded_length'));
    expect(() =>
      calculateSegmentExposure({ segmentId: 0, segmentLengthM: 20, shadedLengthM: 5 })
    ).toThrow(/segmentId/);
  });
});
