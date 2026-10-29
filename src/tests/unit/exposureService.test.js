const { calculateSegmentExposures } = require('../../services/shadow/exposureService');

const solarPosition = {
  instant: '2026-06-21T12:00:00Z',
  localDateTime: '2026-06-21T14:00:00+02:00',
  timeZone: 'Europe/Madrid',
  latitude: 41.6488,
  longitude: -0.8891
};

describe('segment exposure service', () => {
  it('returns ordered, reusable exposure values with an explicit missing segment', async () => {
    const shadowsCalculator = jest.fn().mockResolvedValue({
      status: 'calculated',
      solarPosition,
      requestedSegmentIds: [3, 4],
      missingSegmentIds: [4],
      segments: [
        {
          segmentId: 3,
          segmentSourceId: 'way:3',
          segmentLengthM: 50,
          shadedLengthM: 12.5,
          shadeRatio: 0.25
        }
      ],
      dataQuality: { treesUsable: 20 }
    });

    const result = await calculateSegmentExposures(
      { segmentIds: [3, 4], date: '2026-06-21', time: '14:00', latitude: 41, longitude: -1 },
      { shadowsCalculator }
    );

    expect(shadowsCalculator).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'calculated',
      reference: { instant: solarPosition.instant, timeZone: 'Europe/Madrid' },
      segments: [
        { segmentId: 3, status: 'available', shadePercentage: 25, sunPercentage: 75 },
        { segmentId: 4, status: 'unavailable', reason: 'segment_not_found_or_invalid' }
      ]
    });
  });

  it('reports a sun too low to project shadows without inventing exposure', async () => {
    const shadowsCalculator = jest.fn().mockResolvedValue({
      status: 'sun_too_low',
      solarPosition,
      requestedSegmentIds: [6, 7],
      segments: [],
      dataQuality: {}
    });

    const result = await calculateSegmentExposures({ segmentIds: [6, 7] }, { shadowsCalculator });

    expect(result.status).toBe('sun_too_low');
    expect(result.segments).toEqual([
      expect.objectContaining({ segmentId: 6, status: 'unavailable', reason: 'sun_too_low' }),
      expect.objectContaining({ segmentId: 7, status: 'unavailable', reason: 'sun_too_low' })
    ]);
  });

  it('distinguishes night from a real zero-shadow result', async () => {
    const shadowsCalculator = jest.fn().mockResolvedValue({
      status: 'sun_below_horizon',
      solarPosition: { ...solarPosition, instant: '2026-06-21T00:00:00Z' },
      requestedSegmentIds: [5],
      segments: [],
      dataQuality: {}
    });

    const result = await calculateSegmentExposures({ segmentIds: [5] }, { shadowsCalculator });

    expect(result.status).toBe('sun_below_horizon');
    expect(result.segments[0]).toMatchObject({
      status: 'unavailable',
      reason: 'sun_below_horizon',
      shadePercentage: null,
      sunPercentage: null
    });
  });
});
