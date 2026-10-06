const { env } = require('./env');

const common = { dialect: 'postgres', logging: false, migrationStorageTableName: 'sequelize_meta' };

module.exports = {
  development: { ...common, url: env.databaseUrl },
  test: { ...common, url: env.testDatabaseUrl },
  production: { ...common, url: env.databaseUrl }
};
