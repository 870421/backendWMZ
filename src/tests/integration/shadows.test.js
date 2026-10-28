const { sequelize } = require('../../config/database');
const shadowRepository = require('../../repositories/shadowRepository');

const X0 = 675000;
const Y0 = 4613000;
const toWgs84 = (wkt) => `ST_Transform(ST_GeomFromText('${wkt}', 25830), 4326)`;

const rows = (sql, replacements) =>
  sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

async function insertSegment(sourceId, x) {
  await sequelize.query(
    `INSERT INTO street_segments (source, source_id, osm_way_id, highway, geom, length_m)
     VALUES ('shadow-test', :sourceId, 1, 'footway',
       ${toWgs84(`LINESTRING(${X0 + x} ${Y0 - 5}, ${X0 + x} ${Y0 + 5})`)}, 10)`,
    { replacements: { sourceId } }
  );
}

describe('shadow projection and segment association (PostGIS)', () => {
  beforeAll(async () => {
    await sequelize.query(
      `TRUNCATE buildings, trees, street_segments, association_runs, unassociated_elements,
         import_rejections, import_runs RESTART IDENTITY CASCADE`
    );
    await insertSegment('BUILDING_WEST', -5);
    await insertSegment('NO_SHADOW_EAST', 5);
    await insertSegment('TREE_WEST', 15);

    await sequelize.query(
      `INSERT INTO buildings (source, source_id, height_m, height_source, geom)
       VALUES ('shadow-test', 'B1', 10, 'measured', ${toWgs84(
         `MULTIPOLYGON(((${X0} ${Y0 - 2}, ${X0 + 2} ${Y0 - 2}, ${X0 + 2} ${
           Y0 + 2
         }, ${X0} ${Y0 + 2}, ${X0} ${Y0 - 2})))`
       )})`
    );
    await sequelize.query(
      `INSERT INTO trees (source, source_id, height_m, crown_diameter_m, geom) VALUES
       ('shadow-test', 'T1', 10, 4, ${toWgs84(`POINT(${X0 + 20} ${Y0})`)}),
       ('shadow-test', 'T_OVERLAP', 10, 4, ${toWgs84(`POINT(${X0} ${Y0})`)}),
       ('shadow-test', 'T_NO_HEIGHT', NULL, 4, ${toWgs84(`POINT(${X0 + 20} ${Y0 + 20})`)}),
       ('shadow-test', 'T_NO_CROWN', 10, NULL, ${toWgs84(`POINT(${X0 + 20} ${Y0 + 40})`)})`
    );
    await sequelize.query(
      `INSERT INTO segment_buildings (segment_id, building_id, distance_m, is_nearest)
       SELECT s.id, b.id, ST_Distance(s.geom::geography, b.geom::geography), false
       FROM street_segments s CROSS JOIN buildings b
       WHERE ST_DWithin(
         s.geom::geography,
         b.geom::geography,
         GREATEST(30, b.height_m * 1.5)
       )`
    );
    await sequelize.query(
      `INSERT INTO segment_trees (segment_id, tree_id, distance_m, is_nearest)
       SELECT s.id, t.id, ST_Distance(s.geom::geography, t.geom::geography), false
       FROM street_segments s CROSS JOIN trees t
       WHERE ST_DWithin(s.geom::geography, t.geom::geography, 25)`
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('projects west, intersects full lines and preserves element and segment identifiers', async () => {
    const segmentRows = await rows(`SELECT id, source_id FROM street_segments ORDER BY id`);
    const ids = Object.fromEntries(segmentRows.map((row) => [row.source_id, row.id]));
    const projected = await shadowRepository.projectAndAssociateShadows({
      segmentIds: Object.values(ids),
      lengthPerHeight: 1,
      eastPerHeight: -1,
      northPerHeight: 0
    });
    const bySource = Object.fromEntries(projected.map((row) => [row.segmentSourceId, row]));

    expect(bySource.BUILDING_WEST.shadedLengthM).toBeCloseTo(4, 1);
    expect(bySource.BUILDING_WEST.associations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ elementType: 'building', sourceId: 'B1', heightM: 10 }),
        expect.objectContaining({ elementType: 'tree', sourceId: 'T_OVERLAP', heightM: 10 })
      ])
    );
    // The building and tree cover the same four metres. Their overlap must not be counted twice.
    expect(bySource.BUILDING_WEST.shadedLengthM).toBeCloseTo(4, 1);
    expect(bySource.NO_SHADOW_EAST).toMatchObject({
      shadedLengthM: 0,
      shadeRatio: 0,
      associations: []
    });
    expect(bySource.TREE_WEST.shadedLengthM).toBeCloseTo(4, 1);
    expect(bySource.TREE_WEST.associations).toEqual([
      expect.objectContaining({
        elementType: 'tree',
        sourceId: 'T1',
        heightM: 10,
        crownDiameterM: 4
      })
    ]);
  });

  it('reports incomplete tree data instead of inventing dimensions', async () => {
    await expect(shadowRepository.getUrbanDataQuality()).resolves.toMatchObject({
      buildingsTotal: 1,
      buildingsUsable: 1,
      treesTotal: 4,
      treesUsable: 2,
      treesMissingHeight: 1,
      treesMissingCrownDiameter: 1
    });
  });
});
