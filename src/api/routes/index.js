const { Router } = require('express');

const { requireAuth } = require('../middleware/requireAuth');
const { authRouter } = require('./authRoutes');
const { dataRouter } = require('./dataRoutes');
const { geocodingRouter } = require('./geocodingRoutes');
const { healthRouter } = require('./healthRoutes');
const { routeRouter } = require('./routeRoutes');
const { segmentRouter } = require('./segmentRoutes');

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/data', requireAuth, dataRouter);
apiRouter.use('/geocoding', requireAuth, geocodingRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/routes', requireAuth, routeRouter);
apiRouter.use('/segments', requireAuth, segmentRouter);

module.exports = { apiRouter };
