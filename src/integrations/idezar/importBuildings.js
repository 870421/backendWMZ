const { importConfig } = require('../../config/importConfig');
const { createImportStore } = require('../../services/import/importStore');
const { runImport } = require('../../services/import/importRunner');
const { runImportsCli } = require('../cli');
const { mapBuildingFeature } = require('./buildingMapper');
const { buildGetFeatureUrl, fetchWfsPages } = require('./wfsClient');

function importBuildings({ config = importConfig, store } = {}) {
  const { source, typeName, sortBy } = config.datasets.buildings;
  return runImport({
    dataset: 'buildings',
    sourceUrl: buildGetFeatureUrl(config.idezarWfsUrl, { typeName }),
    pages: fetchWfsPages({
      baseUrl: config.idezarWfsUrl,
      typeName,
      sortBy,
      pageSize: config.wfsPageSize
    }),
    mapItem: (feature) =>
      mapBuildingFeature(feature, { bbox: config.zaragozaBbox, heightConfig: config.height }),
    store: store || createImportStore('buildings', source),
    batchSize: config.batchSize
  });
}

if (require.main === module) runImportsCli([importBuildings]);

module.exports = { importBuildings };
