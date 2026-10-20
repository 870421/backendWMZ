const { ZARAGOZA_TIME_ZONE, calculateSolarPosition } = require('../../domain/solar/solarPosition');

describe('solar position', () => {
  it('matches the NOAA reference equations in Zaragoza at the summer solstice', () => {
    const position = calculateSolarPosition({
      date: '2026-06-21',
      time: '14:00:00',
      latitude: 41.6488,
      longitude: -0.8891
    });

    // NOAA General Solar Position Calculations give 176.40° / 71.78° for this input.
    // SunCalc includes a more precise astronomical model and atmospheric refraction.
    expect(position.azimuthDegrees).toBeCloseTo(176.4, 0);
    expect(position.elevationDegrees).toBeCloseTo(71.78, 0);
    expect(position).toMatchObject({
      aboveHorizon: true,
      instant: '2026-06-21T12:00:00Z',
      localDateTime: '2026-06-21T14:00:00+02:00',
      timeZone: ZARAGOZA_TIME_ZONE
    });
  });

  it('applies Zaragoza winter time and reports the sun below the horizon at night', () => {
    const winter = calculateSolarPosition({
      date: '2026-12-21',
      time: '13:00',
      latitude: 41.6488,
      longitude: -0.8891
    });
    expect(winter.instant).toBe('2026-12-21T12:00:00Z');
    expect(winter.elevationDegrees).toBeCloseTo(24.95, 1);

    const night = calculateSolarPosition({
      date: '2026-06-21',
      time: '02:00',
      latitude: 41.6488,
      longitude: -0.8891
    });
    expect(night.aboveHorizon).toBe(false);
    expect(night.elevationDegrees).toBeLessThan(0);
  });

  it.each([
    [{ date: '21-06-2026', time: '14:00', latitude: 41, longitude: -1 }, /date/],
    [{ date: '2026-02-30', time: '14:00', latitude: 41, longitude: -1 }, /valid local time/],
    [{ date: '2026-06-21', time: '25:00', latitude: 41, longitude: -1 }, /valid local time/],
    [{ date: '2026-06-21', time: '14:00', latitude: '41', longitude: -1 }, /latitude/],
    [{ date: '2026-06-21', time: '14:00', latitude: 91, longitude: -1 }, /latitude/],
    [{ date: '2026-06-21', time: '14:00', latitude: 41, longitude: -181 }, /longitude/],
    [
      {
        date: '2026-06-21',
        time: '14:00',
        latitude: 41,
        longitude: -1,
        timeZone: 'Europe/Unknown'
      },
      /timeZone/
    ]
  ])('rejects invalid input %#', (input, message) => {
    expect(() => calculateSolarPosition(input)).toThrow(message);
  });

  it('rejects nonexistent and ambiguous civil times at DST transitions', () => {
    expect(() =>
      calculateSolarPosition({
        date: '2026-03-29',
        time: '02:30',
        latitude: 41.6488,
        longitude: -0.8891
      })
    ).toThrow(/valid local time/);

    expect(() =>
      calculateSolarPosition({
        date: '2026-10-25',
        time: '02:30',
        latitude: 41.6488,
        longitude: -0.8891
      })
    ).toThrow(/ambiguous/);
  });
});
