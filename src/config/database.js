const { Sequelize } = require('sequelize');

const { env } = require('./env');
const { logger } = require('../utils/logger');

const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: env.nodeEnv === 'development' && process.env.LOG_SQL === 'true' ? logger.debug : false
});

module.exports = { sequelize };
