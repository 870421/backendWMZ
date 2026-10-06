function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) ? value : fallback;
}

const importConfig = {
  idezarWfsUrl:
    process.env.IDEZAR_WFS_URL || 'https://idezar-sig.zaragoza.es/servicios/geoserver/wfs',
  overpassUrl: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
  wfsPageSize: numberFromEnv('IMPORT_WFS_PAGE_SIZE', 2000),
  batchSize: numberFromEnv('IMPORT_BATCH_SIZE', 500),
  datasets: {
    buildings: { source: 'idezar', typeName: 'citygml3d:building', sortBy: 'identifier' },
    trees: { source: 'idezar', typeName: 'idezar_base:arboles_2022', sortBy: 'ID' },
    streets: { source: 'osm', municipalityIneRef: '50297' }
  },
  // Extent published by IDEZAR for the municipality of Zaragoza (catalogue spatialCoverage).
  zaragozaBbox: {
    minLng: -1.1862019211502268,
    minLat: 41.45179233764389,
    maxLng: -0.6849645835987654,
    maxLat: 41.81025542204428
  },
  height: {
    floorHeightM: numberFromEnv('BUILDING_FLOOR_HEIGHT_M', 3),
    groundFloorExtraM: numberFromEnv('BUILDING_GROUND_FLOOR_EXTRA_M', 1),
    defaultHeightM: numberFromEnv('BUILDING_DEFAULT_HEIGHT_M', 4),
    minPlausibleM: numberFromEnv('BUILDING_MIN_PLAUSIBLE_HEIGHT_M', 2),
    maxPlausibleM: numberFromEnv('BUILDING_MAX_PLAUSIBLE_HEIGHT_M', 150),
    minPerFloorM: numberFromEnv('BUILDING_MIN_HEIGHT_PER_FLOOR_M', 2.5),
    maxPerFloorM: numberFromEnv('BUILDING_MAX_HEIGHT_PER_FLOOR_M', 6)
  }
};

module.exports = { importConfig };
