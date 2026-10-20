const { runAssociateCli } = require('../../cli/associate');
const { associationConfig } = require('../../config/associationConfig');
const { sequelize } = require('../../config/database');
const {
  getBuildingsBySegment,
  getNearestSegmentForElement,
  getTreesBySegment,
  runAssociation
} = require('../../services/geo/associationService');
const { createImportStore } = require('../../services/import/importStore');

/*
 * Synthetic dataset in EPSG:25830 (metres), relative to (X0, Y0) in the centre of Zaragoza and
 * stored in 4326 like the real data. Expected distances are planar; geography distances differ
 * by the UTM scale factor (< 0.1 %), hence the 0.5 m tolerance.
 *
 *            y=62  S3 ───────────────────────────────┐ (x 0..295)
 *                                                    │ S2 (x=300, y -100..100)
 *            y=0   S1 ─────────────── (x 0..200)     │
 *            y=-80 S4 ─────────────── (x 0..200)     │
 */
const X0 = 675000;
const Y0 = 4613000;
const config = { ...associationConfig, minPct: 50 };
const TOLERANCE_M = 0.5;

const segments = {
  S1: [
    [0, 0],
    [200, 0]
  ],
  S2: [
    [300, -100],
    [300, 100]
  ],
  S3: [
    [0, 62],
    [295, 62]
  ],
  S4: [
    [0, -80],
    [200, -80]
  ]
};

// [x, y]
const trees = {
  // S2 is 10 m to the east and S3 12 m to the north: S3 is closer in degrees, S2 in metres.
  T_LONLAT: [290, 50],
  // Exactly halfway between S1 and S3 (31 m from each).
  T_TIE: [100, 31],
  // 338 m from S3, beyond ASSOC_MAX_NEAREST_M.
  T_ISO: [100, 400],
  T_S1: [100, 5],
  // 8 m from S3 and 10 m from S2: S2 is a radius link.
  T_CORNER: [290, 70],
  T_S4: [100, -75]
};

// [minX, minY, maxX, maxY, height_m]
const buildings = {
  // 30 m from S4 and 40 m from S1. Low: radius 30 m, so only S4.
  B_LOW: [50, -50, 60, -40, 4],
  // Same distances, 40 m high: radius 60 m, so S4 and S1.
  B_TALL: [120, -50, 130, -40, 40],
  // Polygon 10 m from S2 (its centroid is 47.5 m away) and 25 m from the end of S1.
  B_POLY: [215, -30, 290, -20, 10]
};

const point = ([x, y]) => `POINT(${X0 + x} ${Y0 + y})`;
const toWgs84 = (wkt) => `ST_Transform(ST_GeomFromText('${wkt}', 25830), 4326)`;
const rectangle = ([minX, minY, maxX, maxY]) =>
  `MULTIPOLYGON(((${[
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY]
  ]
    .map(([x, y]) => `${X0 + x} ${Y0 + y}`)
    .join(', ')})))`;

const rows = (sql, replacements) =>
  sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
const count = async (sql, replacements) => Number((await rows(sql, replacements))[0].count);

let ids;

async function loadDataset() {
  const insertSegment = ([name, coordinates]) =>
    sequelize.query(
      `INSERT INTO street_segments (source, source_id, osm_way_id, highway, geom, length_m)
       VALUES ('synthetic', :name, 1, 'footway', ${toWgs84(
         `LINESTRING(${coordinates.map(([x, y]) => `${X0 + x} ${Y0 + y}`).join(', ')})`
       )}, 0)`,
      { replacements: { name } }
    );
  const insertTree = ([name, xy]) =>
    sequelize.query(
      `INSERT INTO trees (source, source_id, crown_diameter_m, geom)
       VALUES ('synthetic', :name, 4, ${toWgs84(point(xy))})`,
      { replacements: { name } }
    );
  const insertBuilding = ([name, box]) =>
    sequelize.query(
      `INSERT INTO buildings (source, source_id, height_m, height_source, geom)
       VALUES ('synthetic', :name, :height, 'measured', ${toWgs84(rectangle(box))})`,
      { replacements: { name, height: box[4] } }
    );

  for (const entry of Object.entries(segments)) await insertSegment(entry); // eslint-disable-line no-await-in-loop
  for (const entry of Object.entries(trees)) await insertTree(entry); // eslint-disable-line no-await-in-loop
  for (const entry of Object.entries(buildings)) await insertBuilding(entry); // eslint-disable-line no-await-in-loop
  // A self-intersecting polygon, as an import that skipped ST_MakeValid would leave it.
  await sequelize.query(
    `INSERT INTO buildings (source, source_id, height_m, height_source, geom)
     VALUES ('synthetic', 'B_BOWTIE', 10, 'measured', ${toWgs84(
       `MULTIPOLYGON(((${X0 + 150} ${Y0 - 30}, ${X0 + 160} ${Y0 - 20}, ${X0 + 160} ${Y0 - 30}, ${
         X0 + 150
       } ${Y0 - 20}, ${X0 + 150} ${Y0 - 30})))`
     )})`
  );

  const idRows = await rows(`
    SELECT source_id, id FROM street_segments UNION ALL
    SELECT source_id, id FROM trees UNION ALL
    SELECT source_id, id FROM buildings`);
  ids = Object.fromEntries(idRows.map((row) => [row.source_id, row.id]));
}

const nearestOf = async (type, name) => getNearestSegmentForElement(type, ids[name]);

const linksOf = async (table, idColumn, name) =>
  (
    await rows(
      `SELECT s.source_id AS segment, round(l.distance_m::numeric, 1)::float8 AS distance,
         l.is_nearest AS nearest
       FROM ${table} l JOIN street_segments s ON s.id = l.segment_id
       WHERE l.${idColumn} = :id ORDER BY l.distance_m`,
      { id: ids[name] }
    )
  ).map(({ segment, nearest }) => ({ segment, nearest }));

const snapshot = () =>
  rows(`
    SELECT 'tree' AS t, segment_id, tree_id AS element_id, distance_m, is_nearest, NULL AS reason
      FROM segment_trees
    UNION ALL SELECT 'building', segment_id, building_id, distance_m, is_nearest, NULL
      FROM segment_buildings
    UNION ALL SELECT element_type, nearest_segment_id, element_id, nearest_distance_m, NULL, reason
      FROM unassociated_elements
    ORDER BY 1, 3, 2`);

describe('association of trees and buildings to street segments (PostGIS)', () => {
  beforeEach(async () => {
    await sequelize.query(
      `TRUNCATE buildings, trees, street_segments, association_runs, unassociated_elements,
         import_rejections, import_runs RESTART IDENTITY CASCADE`
    );
    await loadDataset();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('assigns every element its nearest segment in metres', async () => {
    await runAssociation({ config });

    const expected = {
      tree: { T_LONLAT: ['S2', 10], T_S1: ['S1', 5], T_CORNER: ['S3', 8], T_S4: ['S4', 5] },
      building: { B_LOW: ['S4', 30], B_TALL: ['S4', 30], B_POLY: ['S2', 10] }
    };
    for (const [type, elements] of Object.entries(expected)) {
      for (const [name, [segment, distance]] of Object.entries(elements)) {
        // eslint-disable-next-line no-await-in-loop
        const nearest = await nearestOf(type, name);
        expect({ name, segmentId: nearest.segmentId }).toEqual({ name, segmentId: ids[segment] });
        expect(Math.abs(nearest.distanceM - distance)).toBeLessThan(TOLERANCE_M);
        expect(nearest.associated).toBe(true);
      }
    }
  });

  it('matches a brute-force search over every segment, including the exact tie', async () => {
    await runAssociation({ config });

    const disagreements = await rows(`
      SELECT l.tree_id FROM segment_trees l JOIN trees t ON t.id = l.tree_id
      CROSS JOIN LATERAL (
        SELECT s.id FROM street_segments s
        ORDER BY ST_Distance(s.geom::geography, t.geom::geography), s.id LIMIT 1
      ) b
      WHERE l.is_nearest AND l.segment_id <> b.id`);
    expect(disagreements).toEqual([]);

    const tie = await nearestOf('tree', 'T_TIE');
    expect([ids.S1, ids.S3]).toContain(tie.segmentId);
    expect(Math.abs(tie.distanceM - 31)).toBeLessThan(TOLERANCE_M);
  });

  it('fails with a too small K where degrees and metres disagree, and succeeds with K = 10', async () => {
    // Premise: in 4326 degrees S3 comes first, although S2 is closer in metres.
    const [byDegrees] = await rows(
      `SELECT s.source_id FROM street_segments s, trees t
       WHERE t.source_id = 'T_LONLAT' ORDER BY s.geom <-> t.geom LIMIT 1`
    );
    expect(byDegrees.source_id).toBe('S3');

    await runAssociation({ types: ['tree'], config: { ...config, knnCandidates: 1 } });
    expect((await nearestOf('tree', 'T_LONLAT')).segmentId).toBe(ids.S3);

    await runAssociation({ types: ['tree'], config: { ...config, knnCandidates: 10 } });
    expect((await nearestOf('tree', 'T_LONLAT')).segmentId).toBe(ids.S2);
  });

  it('links buildings to every segment within a radius that grows with their height', async () => {
    await runAssociation({ config });

    expect(await linksOf('segment_buildings', 'building_id', 'B_LOW')).toEqual([
      { segment: 'S4', nearest: true }
    ]);
    expect(await linksOf('segment_buildings', 'building_id', 'B_TALL')).toEqual([
      { segment: 'S4', nearest: true },
      { segment: 'S1', nearest: false }
    ]);
    // Measured against the polygon, not the centroid (47.5 m).
    expect(await linksOf('segment_buildings', 'building_id', 'B_POLY')).toEqual([
      { segment: 'S2', nearest: true },
      { segment: 'S1', nearest: false }
    ]);
    expect(await linksOf('segment_trees', 'tree_id', 'T_CORNER')).toEqual([
      { segment: 'S3', nearest: true },
      { segment: 'S2', nearest: false }
    ]);
  });

  it('records isolated elements and invalid geometries instead of losing them', async () => {
    await runAssociation({ config });

    const isolated = await nearestOf('tree', 'T_ISO');
    expect(isolated).toMatchObject({ associated: false, reason: 'isolated', segmentId: ids.S3 });
    expect(Math.abs(isolated.distanceM - 338)).toBeLessThan(TOLERANCE_M);
    expect(await nearestOf('building', 'B_BOWTIE')).toMatchObject({
      associated: false,
      reason: 'invalid_geometry',
      segmentId: null
    });
    expect(
      await count('SELECT count(*) FROM segment_trees WHERE tree_id = :id', { id: ids.T_ISO })
    ).toBe(0);
  });

  it('reconciles associated + unassociated with the total of each type', async () => {
    const summaries = await runAssociation({ config });

    expect(
      summaries.map(({ type, status, total, nearestOk, unassociated, overlap }) => ({
        type,
        status,
        total,
        nearestOk,
        unassociated,
        overlap
      }))
    ).toEqual([
      { type: 'tree', status: 'success', total: 6, nearestOk: 5, unassociated: 1, overlap: 0 },
      { type: 'building', status: 'success', total: 4, nearestOk: 3, unassociated: 1, overlap: 0 }
    ]);
    const runs = await rows(
      `SELECT element_type, status, total, nearest_ok, isolated, invalid_geometry, radius_links,
         round(pct_associated, 2)::float8 AS pct, params->>'knnCandidates' AS k
       FROM association_runs ORDER BY id`
    );
    expect(runs).toEqual([
      {
        element_type: 'tree',
        status: 'success',
        total: 6,
        nearest_ok: 5,
        isolated: 1,
        invalid_geometry: 0,
        radius_links: 2,
        pct: 83.33,
        k: '10'
      },
      {
        element_type: 'building',
        status: 'success',
        total: 4,
        nearest_ok: 3,
        isolated: 0,
        invalid_geometry: 1,
        radius_links: 2,
        pct: 75,
        k: '10'
      }
    ]);
  });

  it('gives the same result when it runs twice', async () => {
    await runAssociation({ config });
    const first = await snapshot();
    await runAssociation({ config, types: ['building', 'tree'] });

    expect(await snapshot()).toEqual(first);
    expect(await count('SELECT count(*) FROM association_runs')).toBe(4);
  });

  it('exits with a non-zero code when a type is below ASSOC_MIN_PCT', async () => {
    const run = (options) => runAssociation({ ...options, config: associationConfig });

    expect(await runAssociateCli({ argv: ['--type=trees'], run, write: () => {} })).toBe(1);
    expect(
      await count("SELECT count(*) FROM association_runs WHERE status = 'below_threshold'")
    ).toBe(1);

    const lenient = (options) => runAssociation({ ...options, config });
    expect(await runAssociateCli({ argv: [], run: lenient, write: () => {} })).toBe(0);
  });

  it('cascades when a segment is deleted and keeps the isolated record', async () => {
    await runAssociation({ config });

    await sequelize.query('DELETE FROM street_segments WHERE id IN (:ids)', {
      replacements: { ids: [ids.S2, ids.S3] }
    });

    expect(
      await count('SELECT count(*) FROM segment_trees WHERE segment_id IN (:ids)', {
        ids: [ids.S2, ids.S3]
      })
    ).toBe(0);
    expect(await nearestOf('tree', 'T_LONLAT')).toBeNull();
    expect(await nearestOf('tree', 'T_ISO')).toMatchObject({ reason: 'isolated', segmentId: null });
  });

  it('exposes trees and buildings per segment with the attributes used for shadows', async () => {
    await runAssociation({ config });

    // T_TIE is left out: whether it belongs to S1 or S3 depends on the tie.
    const treesOfS3 = (await getTreesBySegment(ids.S3)).filter((t) => t.sourceId !== 'T_TIE');
    expect(treesOfS3.map((tree) => [tree.sourceId, tree.isNearest])).toEqual([
      ['T_CORNER', true],
      ['T_LONLAT', false]
    ]);
    expect(treesOfS3[0]).toMatchObject({ crownDiameterM: 4, geometry: { type: 'Point' } });

    const buildingsOfS1 = await getBuildingsBySegment(ids.S1);
    expect(buildingsOfS1.map((b) => [b.sourceId, b.isNearest, b.associationRadiusM])).toEqual([
      ['B_POLY', false, 30],
      ['B_TALL', false, 60]
    ]);
    expect(buildingsOfS1[1]).toMatchObject({ heightM: 40, heightSource: 'measured' });
  });

  it('marks the latest association runs as stale when an import starts', async () => {
    await runAssociation({ config });

    const marked = await createImportStore('street_segments', 'osm').markAssociationsStale(99);

    expect(marked).toBe(2);
    const runs = await rows(
      `SELECT status, details->>'previousStatus' AS previous, details->>'staleReason' AS reason
       FROM association_runs ORDER BY id`
    );
    expect(runs).toEqual([
      { status: 'stale', previous: 'success', reason: 'import street_segments run 99' },
      { status: 'stale', previous: 'success', reason: 'import street_segments run 99' }
    ]);
    expect(await createImportStore('trees', 'idezar').markAssociationsStale(100)).toBe(0);
  });
});
