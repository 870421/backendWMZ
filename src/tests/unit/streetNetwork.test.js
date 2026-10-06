const { importConfig } = require('../../config/importConfig');
const {
  buildPedestrianNetworkQuery,
  findJunctionNodes,
  indexOverpassElements,
  isWalkable,
  mapWay
} = require('../../integrations/osm/streetNetwork');
const overpass = require('../fixtures/overpass-streets.json');

const { nodesById, ways } = indexOverpassElements(overpass.elements);
const context = { nodesById, junctions: findJunctionNodes(ways), bbox: importConfig.zaragozaBbox };
const mapById = (id) =>
  mapWay(
    ways.find((way) => way.id === id),
    context
  );

describe('pedestrian network query', () => {
  it('filters walkable highways inside the municipality, including tracks', () => {
    const query = buildPedestrianNetworkQuery('50297');

    expect(query).toContain('["ref:ine"~"^50297"]');
    expect(query).toContain('footway|pedestrian|path|steps');
    expect(query).toContain('|track)$"]');
    expect(query).toContain('["foot"!="no"]["access"!="private"]');
  });

  it.each([
    [{ highway: 'track' }, true],
    [{ highway: 'cycleway' }, true],
    [{ highway: 'motorway' }, false],
    [{ highway: 'footway', foot: 'no' }, false],
    [{ highway: 'service', access: 'private' }, false],
    [undefined, false]
  ])('isWalkable(%j) is %s', (tags, expected) => {
    expect(isWalkable(tags)).toBe(expected);
  });
});

describe('street segmentation', () => {
  it('indexes nodes and ways', () => {
    expect(ways).toHaveLength(7);
    expect(nodesById.get(1)).toEqual([-0.88, 41.65]);
  });

  it('detects nodes shared between ways as junctions', () => {
    expect([...context.junctions].sort()).toEqual([1, 2, 3, 5]);
  });

  it('splits ways at internal junctions', () => {
    const result = mapById(100);

    expect(result.records.map((record) => record.sourceId)).toEqual(['100:0', '100:1']);
    expect(result.records[0]).toEqual({
      itemId: '100',
      sourceId: '100:0',
      osmWayId: 100,
      name: 'Calle A',
      highway: 'footway',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-0.88, 41.65],
          [-0.879, 41.65]
        ]
      }
    });
    expect(result.stats).toEqual({ segments: 2 });
  });

  it('keeps ways whose junctions are only at their ends as one segment', () => {
    const result = mapById(102);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].name).toBeNull();
  });

  it.each([
    [103, 'missing_node_coordinates'],
    [104, 'outside_zaragoza_bbox'],
    [105, 'zero_length_way'],
    [106, 'not_walkable']
  ])('rejects way %s with %s', (id, reason) => {
    expect(mapById(id)).toEqual({ sourceId: String(id), rejection: reason });
  });

  it('rejects ways with fewer than two nodes', () => {
    expect(mapWay({ id: 1, nodes: [1], tags: { highway: 'path' } }, context)).toEqual({
      sourceId: '1',
      rejection: 'too_few_nodes'
    });
  });
});
