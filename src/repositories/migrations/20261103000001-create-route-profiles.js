// Routes saved by each user with their weights (PBI-6, ADR-023). The presets are copied to each
// user the first time their routes are listed; route_profiles_seeded keeps a deleted preset from
// coming back.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE route_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        name VARCHAR(40) NOT NULL,
        preset_key VARCHAR(20),
        shade_weight SMALLINT NOT NULL CHECK (shade_weight BETWEEN 0 AND 100),
        sun_weight SMALLINT NOT NULL CHECK (sun_weight BETWEEN 0 AND 100),
        max_detour_percentage SMALLINT NOT NULL DEFAULT 25
          CHECK (max_detour_percentage BETWEEN 0 AND 40),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX route_profiles_user_name_idx ON route_profiles (user_id, lower(name));
      ALTER TABLE users ADD COLUMN route_profiles_seeded BOOLEAN NOT NULL DEFAULT false;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS route_profiles_seeded;
      DROP TABLE IF EXISTS route_profiles;
    `);
  }
};
