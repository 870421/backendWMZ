const importRepository = require('../../repositories/importRepository');
const urbanElementRepository = require('../../repositories/urbanElementRepository');

function createImportStore(table, source) {
  return {
    createRun: importRepository.createRun,
    finishRun: importRepository.finishRun,
    insertRejections: importRepository.insertRejections,
    upsertBatch: (records, runId) =>
      urbanElementRepository.upsertBatch(table, records, { source, runId }),
    deleteStale: (runId) => urbanElementRepository.deleteStale(table, { source, runId })
  };
}

module.exports = { createImportStore };
