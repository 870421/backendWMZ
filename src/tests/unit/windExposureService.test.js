const { getSegmentWindExposure } = require('../../services/wind/windExposureService');

const segment = { id: 7, sourceId: '123:1', name: 'Calle Alfonso I', lengthM: 100 };

function fakeSegments(found = segment) {
  return {
    getSegmentById: jest.fn().mockResolvedValue(found),
    getSegmentPieces: jest.fn().mockResolvedValue([{ bearingDeg: 90, lengthM: 100 }])
  };
}

describe('windExposureService', () => {
  it('uses the current Open-Meteo wind by default', async () => {
    const segments = fakeSegments();
    const weather = jest
      .fn()
      .mockResolvedValue({ windSpeed: 50, windDirection: 270, time: '2026-11-03T12:00' });

    const result = await getSegmentWindExposure(7, null, { segments, weather });

    expect(weather).toHaveBeenCalledTimes(1);
    expect(segments.getSegmentPieces).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({
      segmentId: 7,
      segmentSourceId: '123:1',
      name: 'Calle Alfonso I',
      lengthM: 100,
      wind: { speedKmh: 50, directionDeg: 270, source: 'open-meteo', time: '2026-11-03T12:00' },
      status: 'available'
    });
    expect(result.windExposure).toBeCloseTo(100);
  });

  it('uses the requested wind without calling Open-Meteo', async () => {
    const weather = jest.fn();

    const result = await getSegmentWindExposure(
      7,
      { speedKmh: 30, directionDeg: 0 },
      { segments: fakeSegments(), weather }
    );

    expect(weather).not.toHaveBeenCalled();
    expect(result.wind).toEqual({ speedKmh: 30, directionDeg: 0, source: 'request', time: null });
    expect(result.windExposure).toBeCloseTo(0);
  });

  it('returns 404 for an unknown segment before asking for the weather', async () => {
    const segments = fakeSegments(null);
    const weather = jest.fn();

    await expect(getSegmentWindExposure(7, null, { segments, weather })).rejects.toMatchObject({
      status: 404
    });
    expect(weather).not.toHaveBeenCalled();
    expect(segments.getSegmentPieces).not.toHaveBeenCalled();
  });

  it('propagates the weather provider error', async () => {
    const error = Object.assign(new Error('Invalid weather provider response.'), { status: 502 });

    await expect(
      getSegmentWindExposure(7, null, {
        segments: fakeSegments(),
        weather: jest.fn().mockRejectedValue(error)
      })
    ).rejects.toBe(error);
  });
});
