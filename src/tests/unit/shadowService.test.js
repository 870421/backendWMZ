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
      northPerHeight: expect.closeTo(0, 10)
    });
    expect(result).toMatchObject({
      status: 'calculated',
      requestedSegmentIds: [2, 9],
      missingSegmentIds: [9],
      dataQuality: quality
    });
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
