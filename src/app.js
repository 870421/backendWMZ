const cors = require('cors');
const express = require('express');

const { env } = require('./config/env');
const { errorHandler } = require('./api/middleware/errorHandler');
const { notFoundHandler } = require('./api/middleware/notFoundHandler');
const { apiRouter } = require('./api/routes');

function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
