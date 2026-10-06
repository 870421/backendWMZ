const { runImportsCli } = require('./cli');
const { importBuildings } = require('./idezar/importBuildings');
const { importTrees } = require('./idezar/importTrees');
const { importStreets } = require('./osm/importStreets');

runImportsCli([importBuildings, importTrees, importStreets]);
