const { getDataStatus } = require('../../services/geo/dataStatusService');

async function getStatus(_req, res, next) {
  try {
    res.status(200).json(await getDataStatus());
  } catch (error) {
    next(error);
  }
}

module.exports = { getStatus };
