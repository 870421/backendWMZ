module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      -- The radius queries measure in metres with ST_DWithin(s.geom::geography, ...); this
      -- expression index is what lets PostgreSQL use GIST for them (ADR-009).
      CREATE INDEX street_segments_geog_gist ON street_segments USING GIST ((geom::geography));

      CREATE TABLE segment_trees (
        segment_id INTEGER NOT NULL REFERENCES street_segments (id) ON DELETE CASCADE,
        tree_id INTEGER NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
        distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m >= 0),
        is_nearest BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (segment_id, tree_id)
      );
      CREATE INDEX segment_trees_segment_idx ON segment_trees (segment_id);
      CREATE INDEX segment_trees_tree_idx ON segment_trees (tree_id);
      CREATE UNIQUE INDEX segment_trees_one_nearest_idx ON segment_trees (tree_id) WHERE is_nearest;

      CREATE TABLE segment_buildings (
        segment_id INTEGER NOT NULL REFERENCES street_segments (id) ON DELETE CASCADE,
        building_id INTEGER NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
        distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m >= 0),
        is_nearest BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (segment_id, building_id)
      );
      CREATE INDEX segment_buildings_segment_idx ON segment_buildings (segment_id);
      CREATE INDEX segment_buildings_building_idx ON segment_buildings (building_id);
      CREATE UNIQUE INDEX segment_buildings_one_nearest_idx
        ON segment_buildings (building_id) WHERE is_nearest;

      -- One row per element type and execution of "npm run associate".
      CREATE TABLE association_runs (
        id SERIAL PRIMARY KEY,
        element_type VARCHAR(20) NOT NULL CHECK (element_type IN ('tree', 'building')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        params JSONB NOT NULL,
        total INTEGER,
        nearest_ok INTEGER,
        isolated INTEGER,
        no_segment INTEGER,
        invalid_geometry INTEGER,
        radius_links INTEGER,
        pct_associated NUMERIC(6, 3),
        avg_segments_per_element NUMERIC(8, 3),
        status VARCHAR(20) NOT NULL DEFAULT 'running'
          CHECK (status IN ('running', 'success', 'below_threshold', 'mismatch', 'failed', 'stale')),
        details JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX association_runs_type_started_idx
        ON association_runs (element_type, started_at DESC);

      -- element_id points to trees or buildings depending on element_type, so it has no FK;
      -- "npm run associate" rebuilds the rows of a type from scratch.
      CREATE TABLE unassociated_elements (
        element_type VARCHAR(20) NOT NULL CHECK (element_type IN ('tree', 'building')),
        element_id INTEGER NOT NULL,
        nearest_segment_id INTEGER REFERENCES street_segments (id) ON DELETE SET NULL,
        nearest_distance_m DOUBLE PRECISION,
        reason VARCHAR(20) NOT NULL CHECK (reason IN ('isolated', 'no_segment', 'invalid_geometry')),
        association_run_id INTEGER REFERENCES association_runs (id) ON DELETE SET NULL,
        PRIMARY KEY (element_type, element_id)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS unassociated_elements;
      DROP TABLE IF EXISTS association_runs;
      DROP TABLE IF EXISTS segment_buildings;
      DROP TABLE IF EXISTS segment_trees;
      DROP INDEX IF EXISTS street_segments_geog_gist;
    `);
  }
};
