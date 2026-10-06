const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';

function databaseUrlFrom(name) {
  const user = encodeURIComponent(process.env.DB_USER || 'weathermapz');
  const password = encodeURIComponent(process.env.DB_PASSWORD || 'weathermapz');
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  return `postgres://${user}:${password}@${host}:${port}/${name}`;
}

const developmentDatabaseUrl =
  process.env.DATABASE_URL || databaseUrlFrom(process.env.DB_NAME || 'weathermapz');
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL || databaseUrlFrom(process.env.DB_TEST_NAME || 'weathermapz_test');

const env = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  openRouteServiceApiKey: process.env.ORS_API_KEY || process.env.OPENROUTESERVICE_API_KEY || '',
  openRouteServiceGeocodingBaseUrl:
    process.env.OPENROUTESERVICE_GEOCODING_BASE_URL || 'https://api.heigit.org/pelias/v1',
  openRouteServiceDirectionsBaseUrl:
    process.env.OPENROUTESERVICE_DIRECTIONS_BASE_URL ||
    'https://api.openrouteservice.org/v2/directions',
  databaseUrl: nodeEnv === 'test' ? testDatabaseUrl : developmentDatabaseUrl,
  testDatabaseUrl
};

module.exports = { env };
