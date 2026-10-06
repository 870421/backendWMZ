const { importConfig } = require('../../config/importConfig');
const { createImportStore } = require('../../services/import/importStore');
const { runImport } = require('../../services/import/importRunner');
const { runImportsCli } = require('../cli');
const { runOverpassQuery } = require('./overpassClient');
const {
  buildPedestrianNetworkQuery,
  findJunctionNodes,
  indexOverpassElements,
  mapWay
} = require('./streetNetwork');

// Overpass answers in one response; its way count is the source count for the run.
async function* fetchStreetWays(config, query) {
  const elements = await runOverpassQuery(config.overpassUrl, query);
  const { nodesById, ways } = indexOverpassElements(elements);
  const context = { nodesById, junctions: findJunctionNodes(ways), bbox: config.zaragozaBbox };
  yield { sourceCount: ways.length, items: ways.map((way) => ({ way, context })) };
}

function importStreets({ config = importConfig, store } = {}) {
  const { source, municipalityIneRef } = config.datasets.streets;
  const query = buildPedestrianNetworkQuery(municipalityIneRef);
  return runImport({
    dataset: 'streets',
    sourceUrl: `${config.overpassUrl}?data=${encodeURIComponent(query)}`,
    pages: fetchStreetWays(config, query),
    mapItem: ({ way, context }) => ({ ...mapWay(way, context), raw: way }),
    store: store || createImportStore('street_segments', source),
    batchSize: config.batchSize
  });
}

if (require.main === module) runImportsCli([importStreets]);

module.exports = { importStreets };
