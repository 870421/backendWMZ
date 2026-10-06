const { isInsideBbox } = require('../../domain/geo/geometryValidation');

const WALKABLE_HIGHWAYS = [
  'footway',
  'pedestrian',
  'path',
  'steps',
  'living_street',
  'residential',
  'service',
  'tertiary',
  'secondary',
  'primary',
  'unclassified',
  'cycleway',
  'track'
];

function buildPedestrianNetworkQuery(municipalityIneRef) {
  return [
    '[out:json][timeout:300];',
    `area["boundary"="administrative"]["admin_level"="8"]["ref:ine"~"^${municipalityIneRef}"]->.municipality;`,
    `way["highway"~"^(${WALKABLE_HIGHWAYS.join('|')})$"]["foot"!="no"]["access"!="private"](area.municipality);`,
    'out body;',
    '>;',
    'out skel qt;'
  ].join('\n');
}

function isWalkable(tags = {}) {
  return (
    WALKABLE_HIGHWAYS.includes(tags.highway) && tags.foot !== 'no' && tags.access !== 'private'
  );
}

function indexOverpassElements(elements) {
  const nodesById = new Map();
  const ways = [];
  elements.forEach((element) => {
    if (element.type === 'node') nodesById.set(element.id, [element.lon, element.lat]);
    if (element.type === 'way') ways.push(element);
  });
  return { nodesById, ways };
}

/*
 * A node used by two ways, or twice by the same way, is a junction. Ways are split at every
 * internal junction so each segment runs between intersections or way ends.
 */
function findJunctionNodes(ways) {
  const uses = new Map();
  ways.forEach((way) => {
    (way.nodes || []).forEach((nodeId) => uses.set(nodeId, (uses.get(nodeId) || 0) + 1));
  });
  return new Set([...uses].filter(([, count]) => count > 1).map(([nodeId]) => nodeId));
}

function withoutConsecutiveDuplicates(coordinates) {
  return coordinates.filter(
    (point, index) =>
      index === 0 ||
      point[0] !== coordinates[index - 1][0] ||
      point[1] !== coordinates[index - 1][1]
  );
}

function splitWay(nodeIds, nodesById, junctions) {
  const segments = [];
  let current = [];
  nodeIds.forEach((nodeId, index) => {
    current.push(nodesById.get(nodeId));
    const isLast = index === nodeIds.length - 1;
    if (index > 0 && (isLast || junctions.has(nodeId))) {
      segments.push(withoutConsecutiveDuplicates(current));
      current = [nodesById.get(nodeId)];
    }
  });
  return segments;
}

function mapWay(way, { nodesById, junctions, bbox }) {
  const sourceId = String(way.id);
  const tags = way.tags || {};
  if (!isWalkable(tags)) return { sourceId, rejection: 'not_walkable' };
  const nodeIds = way.nodes || [];
  if (nodeIds.length < 2) return { sourceId, rejection: 'too_few_nodes' };
  if (nodeIds.some((nodeId) => !nodesById.has(nodeId))) {
    return { sourceId, rejection: 'missing_node_coordinates' };
  }
  if (!nodeIds.every((nodeId) => isInsideBbox(nodesById.get(nodeId), bbox))) {
    return { sourceId, rejection: 'outside_zaragoza_bbox' };
  }

  const segments = splitWay(nodeIds, nodesById, junctions);
  const usable = segments.filter((coordinates) => coordinates.length >= 2);
  if (usable.length === 0) return { sourceId, rejection: 'zero_length_way' };
  return {
    sourceId,
    records: usable.map((coordinates, seq) => ({
      itemId: sourceId,
      sourceId: `${sourceId}:${seq}`,
      osmWayId: way.id,
      name: tags.name || null,
      highway: tags.highway,
      geometry: { type: 'LineString', coordinates }
    })),
    stats: {
      segments: usable.length,
      ...(usable.length < segments.length && {
        zero_length_segments_skipped: segments.length - usable.length
      })
    },
    warnings: []
  };
}

module.exports = {
  WALKABLE_HIGHWAYS,
  buildPedestrianNetworkQuery,
  findJunctionNodes,
  indexOverpassElements,
  isWalkable,
  mapWay,
  splitWay
};
