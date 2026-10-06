const { importConfig } = require('../../config/importConfig');
const { importBuildings } = require('../../integrations/idezar/importBuildings');
const { importTrees } = require('../../integrations/idezar/importTrees');
const { importStreets } = require('../../integrations/osm/importStreets');
const buildings = require('../fixtures/idezar-buildings.json');
const trees = require('../fixtures/idezar-trees.json');
const overpass = require('../fixtures/overpass-streets.json');

function memoryStore() {
  const store = {
    records: [],
    rejections: [],
    createRun: jest.fn().mockResolvedValue(1),
    finishRun: jest.fn().mockResolvedValue(),
    insertRejections: jest.fn(async (_runId, _dataset, rows) => store.rejections.push(...rows)),
    upsertBatch: jest.fn(async (records) => {
      store.records.push(...records);
      return { failures: [], repaired: 0 };
    }),
    deleteStale: jest.fn().mockResolvedValue(0)
  };
  return store;
}

const response = (body) => ({ ok: true, status: 200, json: async () => body });

describe('import scripts with fixture sources', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('imports the building fixture and reconciles counts', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(buildings));
    const store = memoryStore();

    const summary = await importBuildings({ store });

    expect(summary).toMatchObject({ status: 'success', sourceCount: 6, imported: 4, rejected: 2 });
    expect(store.rejections.map((row) => row.reason).sort()).toEqual([
      'missing_identifier',
      'outside_zaragoza_bbox'
    ]);
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.searchParams.get('typeNames')).toBe('citygml3d:building');
    expect(url.searchParams.get('sortBy')).toBe('identifier');
    expect(store.createRun).toHaveBeenCalledWith({
      dataset: 'buildings',
      sourceUrl: expect.stringContaining('typeNames=citygml3d%3Abuilding')
    });
  });

  it('imports the tree fixture', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(trees));
    const store = memoryStore();

    const summary = await importTrees({ store });

    expect(summary).toMatchObject({ status: 'success', sourceCount: 5, imported: 4, rejected: 1 });
    expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get('sortBy')).toBe('ID');
  });

  it('imports the street fixture as segments and counts ways', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(overpass));
    const store = memoryStore();

    const summary = await importStreets({ store });

    expect(summary).toMatchObject({ status: 'success', sourceCount: 7, imported: 3, rejected: 4 });
    expect(summary.details.stats.segments).toBe(5);
    expect(store.records.map((record) => record.sourceId)).toEqual([
      '100:0',
      '100:1',
      '101:0',
      '101:1',
      '102:0'
    ]);
    expect(store.rejections.find((row) => row.sourceId === '104').raw).toEqual(
      expect.objectContaining({ id: 104, type: 'way' })
    );
  });

  it('uses the configured Overpass endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({ elements: [] }));
    const config = { ...importConfig, overpassUrl: 'https://overpass.test/api' };

    const summary = await importStreets({ config, store: memoryStore() });

    expect(global.fetch.mock.calls[0][0]).toBe('https://overpass.test/api');
    expect(summary).toMatchObject({ status: 'success', sourceCount: 0, imported: 0 });
  });
});
