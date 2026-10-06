const { logger } = require('../../utils/logger');

function addCounts(target, counts = {}) {
  Object.entries(counts).forEach(([key, value]) => {
    // eslint-disable-next-line no-param-reassign
    target[key] = (target[key] || 0) + value;
  });
}

/*
 * Generic import: maps every source item, upserts accepted records in batches and stores every
 * rejection. The run is 'success' only when imported + rejected equals the count announced by
 * the source; otherwise it is 'mismatch' and stale rows are kept.
 *
 * mapItem(item) => { sourceId, rejection, raw? } | { sourceId, records, stats, warnings, raw? }
 * store: { createRun, finishRun, insertRejections, upsertBatch(records, runId), deleteStale(runId) }
 */
async function runImport({ dataset, sourceUrl, pages, mapItem, store, batchSize = 500 }) {
  const runId = await store.createRun({ dataset, sourceUrl });
  const seen = new Set();
  const details = { stats: {}, rejectionReasons: {}, warnings: 0, repairedGeometries: 0 };
  let sourceCount = null;
  let imported = 0;
  let rejected = 0;
  let pendingItems = [];
  let pendingRejections = [];

  const reject = (sourceId, reason, raw) => {
    pendingRejections.push({ sourceId, reason, raw });
    addCounts(details.rejectionReasons, { [reason.split(':')[0]]: 1 });
    rejected += 1;
  };

  const flush = async () => {
    const items = pendingItems;
    pendingItems = [];
    if (items.length > 0) {
      const records = items.flatMap(({ result }) => result.records);
      const { failures, repaired } = await store.upsertBatch(records, runId);
      details.repairedGeometries += repaired;
      const failureByItem = new Map(failures.map((failure) => [failure.itemId, failure.reason]));
      items.forEach(({ item, result }) => {
        if (failureByItem.has(result.sourceId)) {
          reject(result.sourceId, failureByItem.get(result.sourceId), result.raw ?? item);
        } else {
          imported += 1;
          addCounts(details.stats, result.stats);
        }
      });
    }
    const rejections = pendingRejections;
    pendingRejections = [];
    await store.insertRejections(runId, dataset, rejections);
  };

  const processItem = (item) => {
    const result = mapItem(item);
    if (result.rejection) {
      reject(result.sourceId, result.rejection, result.raw ?? item);
    } else if (seen.has(result.sourceId)) {
      reject(result.sourceId, 'duplicate_source_id', result.raw ?? item);
    } else {
      seen.add(result.sourceId);
      pendingItems.push({ item, result });
      result.warnings.forEach((warning) =>
        logger.warn(`[${dataset}] ${result.sourceId}: ${warning}`)
      );
      details.warnings += result.warnings.length;
    }
  };

  try {
    for await (const page of pages) {
      if (sourceCount === null && Number.isInteger(page.sourceCount))
        sourceCount = page.sourceCount;
      for (const item of page.items) {
        processItem(item);
        // eslint-disable-next-line no-await-in-loop
        if (pendingItems.length >= batchSize) await flush();
      }
      logger.info(
        `[${dataset}] processed ${imported + rejected + pendingItems.length}/${sourceCount ?? '?'}`
      );
    }
    await flush();

    const status =
      sourceCount !== null && imported + rejected === sourceCount ? 'success' : 'mismatch';
    if (status === 'success') details.staleDeleted = await store.deleteStale(runId);
    const summary = { runId, dataset, status, sourceCount, imported, rejected, details };
    await store.finishRun(runId, {
      sourceCount,
      importedCount: imported,
      rejectedCount: rejected,
      status,
      details
    });
    return summary;
  } catch (error) {
    await store.finishRun(runId, {
      sourceCount,
      importedCount: imported,
      rejectedCount: rejected,
      status: 'failed',
      details: { ...details, error: error.message }
    });
    throw error;
  }
}

module.exports = { runImport };
