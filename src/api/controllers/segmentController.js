const { parseSegmentId, parseTypes } = require('../../domain/segments/segmentRequest');
const { parseWindOverride } = require('../../domain/wind/windExposure');
const {
  getNearestSegment,
  getSegmentBySourceId,
  getUrbanElements
} = require('../../services/geo/segmentService');
const windExposureService = require('../../services/wind/windExposureService');

async function getSegmentUrbanElements(req, res, next) {
  try {
    const segmentId = parseSegmentId(req.params.id);
    const types = parseTypes(req.query.types);
    res.status(200).json(await getUrbanElements(segmentId, types));
  } catch (error) {
    next(error);
  }
}

async function getSegmentWindExposure(req, res, next) {
  try {
    const segmentId = parseSegmentId(req.params.id);
    const override = parseWindOverride(req.query);
    res.status(200).json(await windExposureService.getSegmentWindExposure(segmentId, override));
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

module.exports = { getSegmentUrbanElements, getSegmentWindExposure, getNearest, getBySource };
