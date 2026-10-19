const { associationConfig } = require('../../config/associationConfig');
const {
  buildingRadiusM,
  evaluateAssociation,
  validateAssociationConfig
} = require('../../domain/geo/association');

const counts = (overrides) => ({
  total: 100,
  nearestOk: 96,
  isolated: 3,
  noSegment: 0,
  invalidGeometry: 1,
  overlap: 0,
  orphans: 0,
  ...overrides
});

describe('association radius', () => {
  const config = { buildingMinRadiusM: 30, buildingHeightFactor: 1.5 };

  it.each([
    [4, 30],
    [20, 30],
    [40, 60],
    [100, 150]
  ])('a building of %d m gets a radius of %d m', (height, radius) => {
    expect(buildingRadiusM(height, config)).toBe(radius);
  });

  it('falls back to the minimum radius when the height is missing', () => {
    expect(buildingRadiusM(null, config)).toBe(30);
    expect(buildingRadiusM(undefined, config)).toBe(30);
  });
});

describe('validateAssociationConfig', () => {
  it('accepts the default configuration', () => {
    expect(validateAssociationConfig(associationConfig)).toBe(associationConfig);
  });

  it('reports every invalid value at once', () => {
    expect(() =>
      validateAssociationConfig({
        ...associationConfig,
        maxNearestM: 0,
        knnCandidates: 2.5,
        batchSize: 0,
        minPct: 120
      })
    ).toThrow(
      'Invalid association config: maxNearestM must be > 0; knnCandidates must be an integer >= 1; ' +
        'batchSize must be an integer >= 1; minPct must be between 0 and 100'
    );
  });
});

describe('evaluateAssociation', () => {
  it('succeeds when the counts reconcile and the share reaches the minimum', () => {
    expect(evaluateAssociation(counts(), 95)).toEqual({
      pctAssociated: 96,
      unassociated: 4,
      reconciled: true,
      status: 'success'
    });
  });

  it('accepts a share exactly equal to the minimum', () => {
    const result = evaluateAssociation(counts({ nearestOk: 95, isolated: 4 }), 95);
    expect(result.status).toBe('success');
  });

  it('is below threshold under the minimum share', () => {
    const result = evaluateAssociation(counts({ nearestOk: 90, isolated: 9 }), 95);
    expect(result).toMatchObject({ pctAssociated: 90, status: 'below_threshold' });
  });

  it.each([
    ['an element is missing', { nearestOk: 95 }],
    ['an element is in both tables', { overlap: 1 }],
    ['an unassociated row has no element', { orphans: 1 }]
  ])('is a mismatch when %s', (_case, overrides) => {
    expect(evaluateAssociation(counts(overrides), 95)).toMatchObject({
      reconciled: false,
      status: 'mismatch'
    });
  });

  it('treats an empty table as fully associated', () => {
    const empty = counts({ total: 0, nearestOk: 0, isolated: 0, invalidGeometry: 0 });
    expect(evaluateAssociation(empty, 95)).toMatchObject({ pctAssociated: 100, status: 'success' });
  });
});

describe('associationConfig', () => {
  const variables = [
    'ASSOC_MAX_NEAREST_M',
    'ASSOC_KNN_CANDIDATES',
    'ASSOC_TREE_RADIUS_M',
    'ASSOC_BUILDING_MIN_RADIUS_M',
    'ASSOC_BUILDING_HEIGHT_FACTOR',
    'ASSOC_MIN_PCT',
    'ASSOC_BATCH_SIZE'
  ];
  const saved = {};

  beforeEach(() => {
    variables.forEach((name) => {
      saved[name] = process.env[name];
      delete process.env[name];
    });
  });

  afterEach(() => {
    variables.forEach((name) => {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    });
  });

  const load = () => {
    let config;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      ({ associationConfig: config } = require('../../config/associationConfig'));
    });
    return config;
  };

  it('has the agreed defaults', () => {
    expect(load()).toEqual({
      maxNearestM: 150,
      knnCandidates: 10,
      treeRadiusM: 25,
      buildingMinRadiusM: 30,
      buildingHeightFactor: 1.5,
      minPct: 95,
      batchSize: 20000
    });
  });

  it('reads every value from the environment', () => {
    process.env.ASSOC_MAX_NEAREST_M = '200';
    process.env.ASSOC_KNN_CANDIDATES = '20';
    process.env.ASSOC_TREE_RADIUS_M = '15';
    process.env.ASSOC_BUILDING_MIN_RADIUS_M = '40';
    process.env.ASSOC_BUILDING_HEIGHT_FACTOR = '2';
    process.env.ASSOC_MIN_PCT = '90';
    process.env.ASSOC_BATCH_SIZE = '1000';

    expect(load()).toEqual({
      maxNearestM: 200,
      knnCandidates: 20,
      treeRadiusM: 15,
      buildingMinRadiusM: 40,
      buildingHeightFactor: 2,
      minPct: 90,
      batchSize: 1000
    });
  });

  it('ignores values that are not numbers', () => {
    process.env.ASSOC_KNN_CANDIDATES = 'ten';
    expect(load().knnCandidates).toBe(10);
  });
});
