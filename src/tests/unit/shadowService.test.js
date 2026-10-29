const { calculateSegmentShadows } = require('../../services/shadow/shadowService');

const quality = {
  buildingsTotal: 2,
  buildingsUsable: 2,
  buildingsMissingHeight: 0,
  buildingsInvalidGeometry: 0,
  treesTotal: 3,
  treesUsable: 1,
  treesMissingHeight: 1,
  treesMissingCrownDiameter: 1,
  treesInvalidGeometry: 0
};

describe('shadow service', () => {
  it('reuses solar position and reports associations and unknown segments', async () => {
    const repository = {
      getUrbanDataQuality: jest.fn().mockResolvedValue(quality),
      projectAndAssociateShadows: jest
        .fn()
        .mockResolvedValue([{ segmentId: 2, shadedLengthM: 8, shadeRatio: 0.4, associations: [] }])
    };
    const solarCalculator = jest.fn().mockReturnValue({
      azimuthDegrees: 90,
      elevationDegrees: 45,
      aboveHorizon: true
    });

    const result = await calculateSegmentShadows(
      {
        segmentIds: [2, 9, 2],
        date: '2026-06-21',
        time: '14:00',
        latitude: 41.6488,
        longitude: -0.8891
      },
      { repository, solarCalculator }
    );

    expect(repository.projectAndAssociateShadows).toHaveBeenCalledWith({
      segmentIds: [2, 9],
      lengthPerHeight: expect.closeTo(1, 10),
      eastPerHeight: expect.closeTo(-1, 10),
      northPerHeight: expect.closeTo(0, 10),
      timeoutMs: 20000
    });
    expect(result).toMatchObject({
      status: 'calculated',
      requestedSegmentIds: [2, 9],
      missingSegmentIds: [9],
      dataQuality: quality
    });
  });

  it.each([
    // 29/10/2026 17:55 in Zaragoza: a 20 m building would cast a 1.3 km shadow.
    [0.9, 'sun_too_low'],
    [9.99, 'sun_too_low'],
    [10, 'calculated']
  ])('with the sun at %p° the status is %s', async (elevationDegrees, status) => {
    const repository = {
      getUrbanDataQuality: jest.fn().mockResolvedValue(quality),
      projectAndAssociateShadows: jest.fn().mockResolvedValue([])
    };
    const solarCalculator = () => ({ azimuthDegrees: 250, elevationDegrees, aboveHorizon: true });

    const result = await calculateSegmentShadows(
      { segmentIds: [4], date: '2026-10-29', time: '17:55', latitude: 41, longitude: -1 },
      { repository, solarCalculator, config: { minSunElevationDeg: 10, queryTimeoutMs: 5000 } }
    );

    expect(result.status).toBe(status);
    expect(repository.projectAndAssociateShadows).toHaveBeenCalledTimes(
      status === 'calculated' ? 1 : 0
    );
    if (status === 'sun_too_low') {
      expect(result).toMatchObject({ projection: null, segments: [], requestedSegmentIds: [4] });
    } else {
      expect(repository.projectAndAssociateShadows.mock.calls[0][0].timeoutMs).toBe(5000);
    }
  });

  it('does not query geometries when the sun is below the horizon', async () => {
    const repository = {
      getUrbanDataQuality: jest.fn().mockResolvedValue(quality),
      projectAndAssociateShadows: jest.fn()
    };
    const solarCalculator = () => ({
      azimuthDegrees: 10,
      elevationDegrees: -20,
      aboveHorizon: false
    });

    const result = await calculateSegmentShadows(
      { segmentIds: [4], date: '2026-06-21', time: '02:00', latitude: 41, longitude: -1 },
      { repository, solarCalculator }
    );

    expect(result).toMatchObject({
      status: 'sun_below_horizon',
      projection: null,
      segments: [],
      requestedSegmentIds: [4],
      dataQuality: quality
    });
    expect(repository.projectAndAssociateShadows).not.toHaveBeenCalled();
  });

  it('rejects invalid segment identifiers before querying data', async () => {
    const repository = {
      getUrbanDataQuality: jest.fn(),
      projectAndAssociateShadows: jest.fn()
    };
    await expect(calculateSegmentShadows({ segmentIds: [] }, { repository })).rejects.toThrow(
      /segmentIds/
    );
    expect(repository.getUrbanDataQuality).not.toHaveBeenCalled();
  });
});
