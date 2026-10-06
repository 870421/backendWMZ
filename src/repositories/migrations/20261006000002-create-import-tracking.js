module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE import_runs (
        id SERIAL PRIMARY KEY,
        dataset VARCHAR(50) NOT NULL,
        source_url TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        source_count INTEGER,
        imported_count INTEGER NOT NULL DEFAULT 0,
        rejected_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'running'
          CHECK (status IN ('running', 'success', 'mismatch', 'failed')),
        details JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX import_runs_dataset_started_idx ON import_runs (dataset, started_at DESC);

      CREATE TABLE import_rejections (
        id SERIAL PRIMARY KEY,
        import_run_id INTEGER NOT NULL REFERENCES import_runs (id) ON DELETE CASCADE,
        dataset VARCHAR(50) NOT NULL,
        source_id TEXT,
        reason TEXT NOT NULL,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX import_rejections_run_idx ON import_rejections (import_run_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP TABLE IF EXISTS import_rejections; DROP TABLE IF EXISTS import_runs;'
    );
  }
};
