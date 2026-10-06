const { importConfig } = require('../../config/importConfig');
const { createImportStore } = require('../../services/import/importStore');
const { runImport } = require('../../services/import/importRunner');
const { runImportsCli } = require('../cli');
const { mapTreeFeature } = require('./treeMapper');
const { buildGetFeatureUrl, fetchWfsPages } = require('./wfsClient');

function importTrees({ config = importConfig, store } = {}) {
  const { source, typeName, sortBy } = config.datasets.trees;
  return runImport({
    dataset: 'trees',
    sourceUrl: buildGetFeatureUrl(config.idezarWfsUrl, { typeName }),
    pages: fetchWfsPages({
      baseUrl: config.idezarWfsUrl,
      typeName,
      sortBy,
      pageSize: config.wfsPageSize
    }),
    mapItem: (feature) => mapTreeFeature(feature, { bbox: config.zaragozaBbox }),
    store: store || createImportStore('trees', source),
    batchSize: config.batchSize
  });
}

if (require.main === module) runImportsCli([importTrees]);

module.exports = { importTrees };
