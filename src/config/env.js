const dotenv = require('dotenv');

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  openRouteServiceApiKey: process.env.ORS_API_KEY || process.env.OPENROUTESERVICE_API_KEY || '',
  openRouteServiceGeocodingBaseUrl:
    process.env.OPENROUTESERVICE_GEOCODING_BASE_URL || 'https://api.heigit.org/pelias/v1',
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://weathermapz:weathermapz@localhost:5432/weathermapz'
};

module.exports = { env };
