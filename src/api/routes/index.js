const { Router } = require('express');

const { geocodingRouter } = require('./geocodingRoutes');
const { healthRouter } = require('./healthRoutes');

const apiRouter = Router();

apiRouter.use('/geocoding', geocodingRouter);
apiRouter.use('/health', healthRouter);

module.exports = { apiRouter };
