const associationRepository = require('../../repositories/associationRepository');
const importRepository = require('../../repositories/importRepository');
const urbanElementRepository = require('../../repositories/urbanElementRepository');

// Association types whose results an import of each table can invalidate (ADR-010).
const AFFECTED_ASSOCIATIONS = {
  buildings: ['building'],
  trees: ['tree'],
  street_segments: ['tree', 'building']
};

function createImportStore(table, source) {
  return {
    markAssociationsStale: (runId) =>
      associationRepository.markStale(AFFECTED_ASSOCIATIONS[table], `import ${table} run ${runId}`),
    createRun: importRepository.createRun,
    finishRun: importRepository.finishRun,
    insertRejections: importRepository.insertRejections,
    upsertBatch: (records, runId) =>
      urbanElementRepository.upsertBatch(table, records, { source, runId }),
    deleteStale: (runId) => urbanElementRepository.deleteStale(table, { source, runId })
  };
}

module.exports = { createImportStore };
