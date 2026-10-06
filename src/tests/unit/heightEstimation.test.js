const {
  estimateBuildingHeight,
  positiveNumberOrNull
} = require('../../domain/buildings/heightEstimation');

const config = {
  floorHeightM: 3,
  groundFloorExtraM: 1,
  defaultHeightM: 4,
  minPlausibleM: 2,
  maxPlausibleM: 150,
  minPerFloorM: 2.5,
  maxPerFloorM: 6
};

describe('estimateBuildingHeight', () => {
  it('uses a plausible measured height', () => {
    expect(estimateBuildingHeight({ measuredHeightM: 17.7, storeys: 5 }, config)).toEqual({
      heightM: 17.7,
      heightSource: 'measured',
      floors: 5,
      fallbackReason: null
    });
  });

  it('accepts a plausible measured height without storeys', () => {
    expect(estimateBuildingHeight({ measuredHeightM: 9, storeys: null }, config)).toMatchObject({
      heightM: 9,
      heightSource: 'measured',
      floors: null
    });
  });

  it.each([
    [1.5, 1, 'height_below_min'],
    [151, 40, 'height_above_max'],
    [14.6, 1, 'height_per_floor_out_of_range'],
    [8, 4, 'height_per_floor_out_of_range']
  ])(
    'falls back to floors when measured=%s storeys=%s (%s)',
    (measuredHeightM, storeys, reason) => {
      expect(estimateBuildingHeight({ measuredHeightM, storeys }, config)).toEqual({
        heightM: storeys * 3 + 1,
        heightSource: 'floors_estimate',
        floors: storeys,
        fallbackReason: reason
      });
    }
  );

  it('estimates from floors when the measured height is missing', () => {
    expect(estimateBuildingHeight({ measuredHeightM: null, storeys: 3 }, config)).toEqual({
      heightM: 10,
      heightSource: 'floors_estimate',
      floors: 3,
      fallbackReason: 'missing_measured_height'
    });
  });

  it('uses the default when neither height nor storeys are available', () => {
    expect(estimateBuildingHeight({ measuredHeightM: null, storeys: 0 }, config)).toEqual({
      heightM: 4,
      heightSource: 'default',
      floors: null,
      fallbackReason: 'missing_height_and_storeys'
    });
  });

  it('uses the default when an implausible height has no storeys to fall back on', () => {
    expect(estimateBuildingHeight({ measuredHeightM: 400, storeys: null }, config)).toMatchObject({
      heightSource: 'default',
      fallbackReason: 'height_above_max_without_storeys'
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
