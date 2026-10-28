const { sequelize } = require('../../config/database');
const routeSegmentRepository = require('../../repositories/routeSegmentRepository');

describe('route candidate association (PostGIS)', () => {
  beforeAll(async () => {
    await sequelize.query('TRUNCATE street_segments RESTART IDENTITY CASCADE');
    await sequelize.query(
      `INSERT INTO street_segments (source, source_id, osm_way_id, highway, geom, length_m) VALUES
       ('route-test', 'MATCH', 1, 'footway',
         ST_GeomFromText('LINESTRING(-0.8900 41.6500, -0.8890 41.6500)', 4326), 84),
       ('route-test', 'CROSSING', 2, 'footway',
         ST_GeomFromText('LINESTRING(-0.8895 41.6498, -0.8895 41.6502)', 4326), 44)`
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('keeps aligned segments and rejects a street that merely crosses the corridor', async () => {
    const rows = await routeSegmentRepository.findSegmentsForRoutes([
      {
        routeIndex: 0,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-0.89, 41.65],
            [-0.889, 41.65]
          ]
        }
      }
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        routeIndex: 0,
        segmentSourceId: 'MATCH',
        overlapLengthM: expect.any(Number)
      })
    ]);
  });
});
