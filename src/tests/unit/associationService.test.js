const { formatSummaries, parseTypes, runAssociateCli } = require('../../cli/associate');
const { associationConfig } = require('../../config/associationConfig');
const {
  getBuildingsBySegment,
  getNearestSegmentForElement,
  getTreesBySegment,
  runAssociation
} = require('../../services/geo/associationService');

const goodCounts = {
  total: 10,
  nearestOk: 10,
  isolated: 0,
  noSegment: 0,
  invalidGeometry: 0,
  overlap: 0,
  orphans: 0,
  radiusLinks: 4,
  avgSegmentsPerElement: 1.4,
  meanDistanceM: 7.25,
  p95DistanceM: 20
};

function fakeRepository({ counts = goodCounts, range = { minId: 1, maxId: 25 } } = {}) {
  return {
    withTransaction: jest.fn((callback) => callback('tx')),
    createRun: jest.fn().mockResolvedValue(3),
    finishRun: jest.fn().mockResolvedValue(),
    clearType: jest.fn().mockResolvedValue(),
    idRange: jest.fn().mockResolvedValue(range),
    associateNearest: jest.fn().mockResolvedValue(),
    associateRadius: jest.fn().mockResolvedValue(),
    countResults: jest.fn().mockResolvedValue(counts),
    getTreesBySegment: jest.fn().mockResolvedValue([{ id: 1 }]),
    getBuildingsBySegment: jest.fn().mockResolvedValue([
      { id: 1, heightM: 40 },
      { id: 2, heightM: null }
    ]),
    getNearestSegmentForElement: jest.fn().mockResolvedValue({ segmentId: 5 })
  };
}

const config = { ...associationConfig, batchSize: 10 };

describe('runAssociation', () => {
  it('clears the type and associates it by id range inside one transaction', async () => {
    const repository = fakeRepository();

    const [summary] = await runAssociation({ types: ['tree'], config, repository });

    expect(repository.clearType).toHaveBeenCalledWith('tree', 'tx');
    expect(repository.associateNearest.mock.calls.map((call) => call[1])).toEqual([
      { fromId: 1, toId: 10 },
      { fromId: 11, toId: 20 },
      { fromId: 21, toId: 30 }
    ]);
    expect(repository.associateNearest).toHaveBeenCalledWith(
      'tree',
      expect.any(Object),
      config,
      3,
      'tx'
    );
    expect(repository.associateRadius).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      runId: 3,
      type: 'tree',
      status: 'success',
      pctAssociated: 100
    });
    expect(repository.createRun).toHaveBeenCalledWith(
      'tree',
      expect.objectContaining({ knnCandidates: 10, maxNearestM: 150, batchSize: 10 })
    );
    expect(repository.finishRun).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        status: 'success',
        radiusLinks: 4,
        details: expect.objectContaining({ p95DistanceM: 20, overlap: 0 })
      })
    );
  });

  it('associates trees and then buildings by default', async () => {
    const repository = fakeRepository();

    const summaries = await runAssociation({ config, repository });

    expect(summaries.map((summary) => summary.type)).toEqual(['tree', 'building']);
  });

  it('skips the batches when the table is empty', async () => {
    const repository = fakeRepository({
      range: { minId: null, maxId: null },
      counts: { ...goodCounts, total: 0, nearestOk: 0 }
    });

    const [summary] = await runAssociation({ types: ['building'], config, repository });

    expect(repository.associateNearest).not.toHaveBeenCalled();
    expect(summary.status).toBe('success');
  });

  it('reports a mismatch when an element is both associated and unassociated', async () => {
    const repository = fakeRepository({ counts: { ...goodCounts, isolated: 1, overlap: 1 } });

    const [summary] = await runAssociation({ types: ['tree'], config, repository });

    expect(summary.status).toBe('mismatch');
    expect(repository.finishRun).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ status: 'mismatch' })
    );
  });

  it('stores a failed run and rethrows when the database fails', async () => {
    const repository = fakeRepository();
    repository.associateNearest.mockRejectedValue(new Error('connection lost'));

    await expect(runAssociation({ types: ['tree'], config, repository })).rejects.toThrow(
      'connection lost'
    );
    expect(repository.finishRun).toHaveBeenCalledWith(3, {
      status: 'failed',
      details: { error: 'connection lost', durationMs: expect.any(Number) }
    });
  });

  it('rejects unknown types and invalid configuration before touching the database', async () => {
    const repository = fakeRepository();

    await expect(runAssociation({ types: ['bench'], config, repository })).rejects.toThrow(
      'Unknown element type bench'
    );
    await expect(
      runAssociation({ config: { ...config, knnCandidates: 0 }, repository })
    ).rejects.toThrow('knnCandidates');
    expect(repository.createRun).not.toHaveBeenCalled();
  });
});

describe('association read access', () => {
  it('returns the trees of a segment', async () => {
    const repository = fakeRepository();
    expect(await getTreesBySegment(7, { repository })).toEqual([{ id: 1 }]);
    expect(repository.getTreesBySegment).toHaveBeenCalledWith(7);
  });

  it('adds the association radius to every building', async () => {
    const repository = fakeRepository();
    const buildings = await getBuildingsBySegment(7, { repository, config });
    expect(buildings.map((building) => building.associationRadiusM)).toEqual([60, 30]);
  });

  it('validates the element type of a nearest segment lookup', async () => {
    const repository = fakeRepository();
    expect(await getNearestSegmentForElement('tree', 4, { repository })).toEqual({ segmentId: 5 });
    expect(() => getNearestSegmentForElement('bench', 4, { repository })).toThrow('Unknown');
  });
});

describe('associate command', () => {
  const summary = (type, status) => ({
    runId: 1,
    type,
    status,
    total: 10,
    nearestOk: 9,
    pctAssociated: 90,
    unassociated: 1,
    isolated: 1,
    noSegment: 0,
    invalidGeometry: 0,
    overlap: 0,
    orphans: 0,
    radiusLinks: 3,
    avgSegmentsPerElement: 1.3333,
    meanDistanceM: 7.25,
    p95DistanceM: null,
    durationMs: 1500
  });

  it('parses the optional --type argument', () => {
    expect(parseTypes([])).toEqual(['tree', 'building']);
    expect(parseTypes(['--type=trees'])).toEqual(['tree']);
    expect(parseTypes(['--type=buildings'])).toEqual(['building']);
    expect(() => parseTypes(['--type=benches'])).toThrow('Unknown --type=benches');
  });

  it('prints one row per type', () => {
    const table = formatSummaries([summary('tree', 'success')]).split('\n');
    expect(table[0]).toMatch(/type\s+status\s+total\s+nearest<=max\s+%\s+isolated/);
    expect(table[1]).toMatch(/tree\s+success\s+10\s+9\s+90\.00\s+1/);
    expect(table[1]).toMatch(/1\.33\s+7\.3\s+-\s+1\.5$/);
  });

  it('exits with 0 only when every type succeeds', async () => {
    const write = jest.fn();
    const ok = jest.fn().mockResolvedValue([summary('tree', 'success')]);
    expect(await runAssociateCli({ argv: ['--type=trees'], run: ok, write })).toBe(0);
    expect(ok).toHaveBeenCalledWith({ types: ['tree'] });
    expect(write).toHaveBeenCalledWith(expect.stringContaining('success'));

    const low = jest
      .fn()
      .mockResolvedValue([summary('tree', 'success'), summary('building', 'below_threshold')]);
    expect(await runAssociateCli({ argv: [], run: low, write })).toBe(1);
  });

  it('exits with 1 when the association fails or the arguments are wrong', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('database down'));
    expect(await runAssociateCli({ argv: [], run: failing, write: jest.fn() })).toBe(1);
    expect(await runAssociateCli({ argv: ['--type=x'], run: failing, write: jest.fn() })).toBe(1);
  });
});
