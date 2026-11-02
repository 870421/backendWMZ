const defaultRepository = require('../../repositories/dataStatusRepository');

const ASSOCIATION_TYPES = ['tree', 'building'];

async function getDataStatus({ repository = defaultRepository } = {}) {
  const [imports, associations] = await Promise.all([
    repository.getLatestImportRuns(),
    repository.getLatestAssociationRuns(ASSOCIATION_TYPES)
  ]);
  return {
    imports,
    associations: associations.map((run) => ({ ...run, stale: run.status === 'stale' }))
  };
}

module.exports = { getDataStatus };
