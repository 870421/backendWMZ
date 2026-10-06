const { runImport } = require('../../services/import/importRunner');

function fakeStore({ failures = [], repaired = 0 } = {}) {
  return {
    createRun: jest.fn().mockResolvedValue(7),
    finishRun: jest.fn().mockResolvedValue(),
    insertRejections: jest.fn().mockResolvedValue(),
    upsertBatch: jest.fn().mockResolvedValue({ failures, repaired }),
    deleteStale: jest.fn().mockResolvedValue(3)
  };
}

async function* pagesOf(...pages) {
  yield* pages;
}

const accept = (id) => ({
  sourceId: id,
  records: [{ itemId: id, sourceId: id }],
  stats: { ok: 1 },
  warnings: []
});

const mapItem = (item) =>
  item.bad ? { sourceId: item.id, rejection: 'bad_item' } : accept(item.id);

describe('runImport', () => {
  it('imports in batches, records rejections and succeeds when counts match', async () => {
    const store = fakeStore();
    const summary = await runImport({
      dataset: 'trees',
      sourceUrl: 'https://example.test/wfs',
      pages: pagesOf(
        { sourceCount: 4, items: [{ id: 'a' }, { id: 'b', bad: true }] },
        { sourceCount: 4, items: [{ id: 'c' }, { id: 'd' }] }
      ),
      mapItem,
      store,
      batchSize: 2
    });

    expect(summary).toMatchObject({
      runId: 7,
      status: 'success',
      sourceCount: 4,
      imported: 3,
      rejected: 1
    });
    expect(summary.details).toMatchObject({
      stats: { ok: 3 },
      rejectionReasons: { bad_item: 1 },
      staleDeleted: 3
    });
    expect(store.upsertBatch).toHaveBeenCalledTimes(2);
    expect(store.insertRejections).toHaveBeenCalledWith(7, 'trees', [
      { sourceId: 'b', reason: 'bad_item', raw: { id: 'b', bad: true } }
    ]);
    expect(store.finishRun).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: 'success', importedCount: 3, rejectedCount: 1 })
    );
  });

  it('rejects duplicated source ids instead of upserting them twice', async () => {
    const store = fakeStore();
    const summary = await runImport({
      dataset: 'trees',
      sourceUrl: 'u',
      pages: pagesOf({ sourceCount: 2, items: [{ id: 'a' }, { id: 'a' }] }),
      mapItem,
      store
    });

    expect(summary).toMatchObject({ status: 'success', imported: 1, rejected: 1 });
    expect(summary.details.rejectionReasons).toEqual({ duplicate_source_id: 1 });
  });

  it('turns database failures into rejections and counts repaired geometries', async () => {
    const store = fakeStore({
      failures: [{ itemId: 'b', reason: 'invalid_geometry' }],
      repaired: 1
    });
    const summary = await runImport({
      dataset: 'buildings',
      sourceUrl: 'u',
      pages: pagesOf({ sourceCount: 2, items: [{ id: 'a' }, { id: 'b' }] }),
      mapItem: (item) => ({ ...accept(item.id), raw: { original: item.id } }),
      store
    });

    expect(summary).toMatchObject({ status: 'success', imported: 1, rejected: 1 });
    expect(summary.details.repairedGeometries).toBe(1);
    expect(store.insertRejections).toHaveBeenCalledWith(7, 'buildings', [
      { sourceId: 'b', reason: 'invalid_geometry', raw: { original: 'b' } }
    ]);
  });

  it('marks the run as mismatch and keeps stale rows when counts differ', async () => {
    const store = fakeStore();
    const summary = await runImport({
      dataset: 'trees',
      sourceUrl: 'u',
      pages: pagesOf({ sourceCount: 5, items: [{ id: 'a' }] }),
      mapItem,
      store
    });

    expect(summary.status).toBe('mismatch');
    expect(store.deleteStale).not.toHaveBeenCalled();
  });

  it('marks the run as mismatch when the source does not announce a count', async () => {
    const summary = await runImport({
      dataset: 'trees',
      sourceUrl: 'u',
      pages: pagesOf({ items: [{ id: 'a' }] }),
      mapItem,
      store: fakeStore()
    });

    expect(summary).toMatchObject({ status: 'mismatch', sourceCount: null });
  });

  it('stores the run as failed and rethrows when the source fails', async () => {
    const store = fakeStore();
    async function* failingPages() {
      yield { sourceCount: 2, items: [{ id: 'a' }] };
      throw new Error('network down');
    }

    await expect(
      runImport({ dataset: 'trees', sourceUrl: 'u', pages: failingPages(), mapItem, store })
    ).rejects.toThrow('network down');
    expect(store.finishRun).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: 'failed',
        details: expect.objectContaining({ error: 'network down' })
      })
    );
  });

  it('counts mapper warnings', async () => {
    const summary = await runImport({
      dataset: 'buildings',
      sourceUrl: 'u',
      pages: pagesOf({ sourceCount: 1, items: [{ id: 'a' }] }),
      mapItem: (item) => ({ ...accept(item.id), warnings: ['height fallback'] }),
      store: fakeStore()
    });

    expect(summary.details.warnings).toBe(1);
  });
});
