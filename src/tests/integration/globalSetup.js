const { execSync } = require('child_process');
const path = require('path');

const { Client } = require('pg');

module.exports = async function globalSetup() {
  process.env.NODE_ENV = 'test';
  // eslint-disable-next-line global-require
  const { env } = require('../../config/env');
  const client = new Client({ connectionString: env.testDatabaseUrl });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Integration tests need the test database (${error.message}). Run "docker compose up -d db" first.`
    );
  } finally {
    await client.end().catch(() => {});
  }
  execSync('npx sequelize-cli db:migrate --env test', {
    cwd: path.resolve(__dirname, '../../..'),
    stdio: 'ignore'
  });
};
