const { Router } = require('express');

const {
  getBySource,
  getNearest,
  getSegmentUrbanElements
} = require('../controllers/segmentController');

const segmentRouter = Router();

// Fixed paths first: "/nearest" must not be read as an :id.
segmentRouter.get('/nearest', getNearest);
segmentRouter.get('/by-source/:sourceId', getBySource);
segmentRouter.get('/:id/urban-elements', getSegmentUrbanElements);

module.exports = { segmentRouter };
