const { Router } = require('express');

const { healthRouter } = require('./healthRoutes');

const apiRouter = Router();

apiRouter.use('/health', healthRouter);

module.exports = { apiRouter };

