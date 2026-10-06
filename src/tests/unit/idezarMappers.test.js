const { importConfig } = require('../../config/importConfig');
const { mapBuildingFeature } = require('../../integrations/idezar/buildingMapper');
const { mapTreeFeature } = require('../../integrations/idezar/treeMapper');
const buildings = require('../fixtures/idezar-buildings.json');
const trees = require('../fixtures/idezar-trees.json');

const options = { bbox: importConfig.zaragozaBbox, heightConfig: importConfig.height };
const byId = (collection, id) => collection.features.find((feature) => feature.id === id);

describe('mapBuildingFeature', () => {
  const results = buildings.features.map((feature) => mapBuildingFeature(feature, options));

  it('maps a building with a plausible measured height', () => {
    const result = mapBuildingFeature(
      byId(buildings, 'building.fid-24380387_1a111c80fd9_1517'),
      options
    );

    expect(result.rejection).toBeUndefined();
    expect(result.records).toEqual([
      expect.objectContaining({
        itemId: 'ES.SDGC.BU.3512704XM8231D01',
        sourceId: 'ES.SDGC.BU.3512704XM8231D01',
        heightM: 4.9,
        heightSource: 'measured',
        floors: 1,
        geometry: expect.objectContaining({ type: 'MultiPolygon' })
      })
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('logs, but does not reject, implausible measured heights', () => {
    const result = mapBuildingFeature(byId(buildings, 'building.implausible'), options);

    expect(result.records[0]).toMatchObject({ heightM: 13, heightSource: 'floors_estimate' });
    expect(result.warnings[0]).toContain('height_per_floor_out_of_range');
    expect(result.stats).toEqual({
      'height_source:floors_estimate': 1,
      'height_fallback:height_per_floor_out_of_range': 1
    });
  });

  it('keeps multipolygons and estimates height from floors when it is missing', () => {
    const result = mapBuildingFeature(byId(buildings, 'building.multi'), options);

    expect(result.records[0]).toMatchObject({
      heightM: 10,
      heightSource: 'floors_estimate',
      geometry: { type: 'MultiPolygon' }
    });
  });

  it('rejects buildings without identifier or outside Zaragoza', () => {
    expect(results.filter((result) => result.rejection)).toEqual([
      { sourceId: 'building.missing-id', rejection: 'missing_identifier' },
      { sourceId: 'TEST.OUTSIDE', rejection: 'outside_zaragoza_bbox' }
    ]);
  });

  it('handles features without properties', () => {
    expect(mapBuildingFeature({}, options)).toEqual({
      sourceId: null,
      rejection: 'missing_identifier'
    });
  });
});

describe('mapTreeFeature', () => {
  it('maps species, height and crown diameter', () => {
    const result = mapTreeFeature(byId(trees, 'arboles_2022.41283'), options);

    expect(result.records).toEqual([
      {
        itemId: '390415',
        sourceId: '390415',
        species: "Morus alba 'Kagayamae'",
        heightM: 2.5,
        crownDiameterM: 4,
        geometry: { type: 'Point', coordinates: expect.any(Array) }
      }
    ]);
    expect(result.stats).toEqual({});
  });

  it('stores empty attributes as null and counts them', () => {
    const result = mapTreeFeature(byId(trees, 'arboles_2022.empty'), options);

    expect(result.records[0]).toMatchObject({
      species: null,
      heightM: null,
      crownDiameterM: null
    });
    expect(result.stats).toEqual({
      missing_height: 1,
      missing_crown_diameter: 1,
      missing_species: 1
    });
  });

  it('rejects trees without geometry or identifier', () => {
    expect(mapTreeFeature(byId(trees, 'arboles_2022.nogeom'), options)).toEqual({
      sourceId: 'TEST-NOGEOM',
      rejection: 'unsupported_geometry_type'
    });
    expect(mapTreeFeature({ id: 'x', properties: { ID: null } }, options)).toEqual({
      sourceId: 'x',
      rejection: 'missing_identifier'
    });
  });
});
