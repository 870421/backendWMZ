const { importConfig } = require('../../config/importConfig');
const {
  estimateBuildingHeight,
  positiveNumberOrNull
} = require('../../domain/buildings/heightEstimation');

const config = importConfig.height;
const estimate = (measuredHeightM, storeys) =>
  estimateBuildingHeight({ measuredHeightM, storeys }, config);

describe('estimateBuildingHeight', () => {
  it('uses the default configuration documented in ADR-001', () => {
    expect(config).toEqual({
      floorHeightM: 3,
      groundFloorExtraM: 1,
      defaultHeightM: 4,
      minHeightM: 2,
      maxHeightM: 150,
      minHeightPerFloorM: 2,
      maxHeightPerFloorM: 8,
      maxSingleStoreyHeightM: 40,
      suspiciousSingleStoreyHeightM: 15,
      suspiciousHeightPerFloorM: 6
    });
  });

  describe('single-storey buildings (warehouses, churches, sports halls)', () => {
    it('keeps 12 m measured, not suspicious', () => {
      expect(estimate(12, 1)).toEqual({
        heightM: 12,
        heightSource: 'measured',
        heightSuspicious: false,
        floors: 1,
        fallbackReason: null
      });
    });

    it('keeps 18 m measured and flags it as suspicious', () => {
      expect(estimate(18, 1)).toMatchObject({
        heightM: 18,
        heightSource: 'measured',
        heightSuspicious: true
      });
    });

    it('replaces 45 m with the one-storey estimate (4 m)', () => {
      expect(estimate(45, 1)).toEqual({
        heightM: 4,
        heightSource: 'floors_estimate',
        heightSuspicious: false,
        floors: 1,
        fallbackReason: 'single_storey_height_above_max'
      });
    });
  });

  describe('multi-storey buildings', () => {
    it('replaces 7 m with 5 storeys (1.4 m per storey) with 16 m', () => {
      expect(estimate(7, 5)).toEqual({
        heightM: 16,
        heightSource: 'floors_estimate',
        heightSuspicious: false,
        floors: 5,
        fallbackReason: 'height_per_floor_below_min'
      });
    });

    it('replaces 30 m with 3 storeys (10 m per storey)', () => {
      expect(estimate(30, 3)).toMatchObject({
        heightM: 10,
        heightSource: 'floors_estimate',
        fallbackReason: 'height_per_floor_above_max'
      });
    });

    it('keeps 26 m with 4 storeys (6.5 m per storey) and flags it as suspicious', () => {
      expect(estimate(26, 4)).toMatchObject({
        heightM: 26,
        heightSource: 'measured',
        heightSuspicious: true
      });
    });

    it('keeps an ordinary block without flagging it', () => {
      expect(estimate(17.7, 5)).toMatchObject({
        heightM: 17.7,
        heightSource: 'measured',
        heightSuspicious: false
      });
    });
  });

  describe('absolute limits', () => {
    it('replaces 1.5 m', () => {
      expect(estimate(1.5, 1)).toMatchObject({
        heightM: 4,
        heightSource: 'floors_estimate',
        fallbackReason: 'height_below_min'
      });
    });

    it('replaces 200 m', () => {
      expect(estimate(200, 40)).toMatchObject({
        heightM: 121,
        heightSource: 'floors_estimate',
        fallbackReason: 'height_above_max'
      });
    });
  });

  describe('thresholds are inclusive (the limit value is accepted)', () => {
    it.each([
      ['2 m (minimum height)', 2, 1, false],
      ['150 m (maximum height)', 150, 30, false],
      ['40 m with one storey (single-storey maximum)', 40, 1, true],
      ['8 m per storey (per-storey maximum)', 16, 2, true],
      ['2 m per storey (per-storey minimum)', 4, 2, false]
    ])('accepts %s', (_label, heightM, storeys, suspicious) => {
      expect(estimate(heightM, storeys)).toMatchObject({
        heightM,
        heightSource: 'measured',
        heightSuspicious: suspicious
      });
    });

    it.each([
      ['just under 2 m', 1.99, 1],
      ['just over 150 m', 150.1, 30],
      ['just over 40 m with one storey', 40.1, 1],
      ['just over 8 m per storey', 16.2, 2],
      ['just under 2 m per storey', 3.9, 2]
    ])('replaces %s', (_label, heightM, storeys) => {
      expect(estimate(heightM, storeys).heightSource).toBe('floors_estimate');
    });

    it('does not flag exactly 15 m with one storey or exactly 6 m per storey', () => {
      expect(estimate(15, 1).heightSuspicious).toBe(false);
      expect(estimate(12, 2).heightSuspicious).toBe(false);
    });
  });

  describe('missing data', () => {
    it('estimates from storeys when the measured height is missing', () => {
      expect(estimate(null, 3)).toEqual({
        heightM: 10,
        heightSource: 'floors_estimate',
        heightSuspicious: false,
        floors: 3,
        fallbackReason: 'missing_measured_height'
      });
    });

    it('uses the default without height or storeys', () => {
      expect(estimate(null, null)).toEqual({
        heightM: 4,
        heightSource: 'default',
        heightSuspicious: false,
        floors: null,
        fallbackReason: 'missing_height_and_storeys'
      });
    });

    it('treats 0 storeys as unknown and applies the single-storey range', () => {
      expect(estimate(30, 0)).toMatchObject({
        heightSource: 'measured',
        heightSuspicious: true,
        floors: null
      });
    });

    it('uses the default when a wrong height has no storeys to fall back on', () => {
      expect(estimate(45, null)).toMatchObject({
        heightM: 4,
        heightSource: 'default',
        fallbackReason: 'single_storey_height_above_max_without_storeys'
      });
    });
  });
});

describe('positiveNumberOrNull', () => {
  it.each([
    ['10.0', 10],
    ['4,5', 4.5],
    [3, 3],
    ['', null],
    ['abc', null],
    [0, null],
    [-2, null],
    [null, null],
    [undefined, null]
  ])('parses %p as %p', (input, expected) => {
    expect(positiveNumberOrNull(input)).toBe(expected);
  });
});
