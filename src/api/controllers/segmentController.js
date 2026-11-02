const { parseSegmentId, parseTypes } = require('../../domain/segments/segmentRequest');
const {
  getNearestSegment,
  getSegmentBySourceId,
  getUrbanElements
} = require('../../services/geo/segmentService');

async function getSegmentUrbanElements(req, res, next) {
  try {
    const segmentId = parseSegmentId(req.params.id);
    const types = parseTypes(req.query.types);
    res.status(200).json(await getUrbanElements(segmentId, types));
  } catch (error) {
    next(error);
  }
}

async function getNearest(req, res, next) {
  try {
    res.status(200).json(await getNearestSegment(req.query));
  } catch (error) {
    next(error);
  }
}

async function getBySource(req, res, next) {
  try {
    res.status(200).json(await getSegmentBySourceId(req.params.sourceId));
  } catch (error) {
    next(error);
  }
}

module.exports = { getSegmentUrbanElements, getNearest, getBySource };
