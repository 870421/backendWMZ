module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE buildings (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        source_id TEXT NOT NULL,
        height_m DOUBLE PRECISION NOT NULL CHECK (height_m > 0),
        height_source VARCHAR(20) NOT NULL
          CHECK (height_source IN ('measured', 'floors_estimate', 'default')),
        floors SMALLINT,
        geom geometry(MultiPolygon, 4326) NOT NULL,
        import_run_id INTEGER REFERENCES import_runs (id) ON DELETE SET NULL,
        UNIQUE (source, source_id)
      );
      CREATE INDEX buildings_geom_gist ON buildings USING GIST (geom);

      CREATE TABLE trees (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        source_id TEXT NOT NULL,
        species TEXT,
        height_m DOUBLE PRECISION,
        crown_diameter_m DOUBLE PRECISION,
        geom geometry(Point, 4326) NOT NULL,
        import_run_id INTEGER REFERENCES import_runs (id) ON DELETE SET NULL,
        UNIQUE (source, source_id)
      );
      CREATE INDEX trees_geom_gist ON trees USING GIST (geom);

      CREATE TABLE street_segments (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        source_id TEXT NOT NULL,
        osm_way_id BIGINT NOT NULL,
        name TEXT,
        highway VARCHAR(50) NOT NULL,
        geom geometry(LineString, 4326) NOT NULL,
        length_m DOUBLE PRECISION NOT NULL,
        import_run_id INTEGER REFERENCES import_runs (id) ON DELETE SET NULL,
        UNIQUE (source, source_id)
      );
      CREATE INDEX street_segments_geom_gist ON street_segments USING GIST (geom);
      CREATE INDEX street_segments_osm_way_idx ON street_segments (osm_way_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP TABLE IF EXISTS street_segments; DROP TABLE IF EXISTS trees; DROP TABLE IF EXISTS buildings;'
    );
  }
};
