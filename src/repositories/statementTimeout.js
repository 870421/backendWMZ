const { sequelize } = require('../config/database');
const { httpError } = require('../utils/httpError');

// SQLSTATE of a statement cancelled by statement_timeout.
const QUERY_CANCELED = '57014';

/*
 * Runs callback(transaction) with a PostgreSQL statement_timeout that only applies to that
 * transaction (SET LOCAL), so a heavy request cannot keep the database busy indefinitely
 * (ADR-015). A timeout becomes a controlled 504.
 */
async function withStatementTimeout(timeoutMs, callback) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
  try {
    return await sequelize.transaction(async (transaction) => {
      // SET does not accept bind parameters; timeoutMs is a validated integer.
      await sequelize.query(`SET LOCAL statement_timeout = ${timeoutMs}`, { transaction });
      return callback(transaction);
    });
  } catch (error) {
    if (error.original?.code === QUERY_CANCELED) {
      throw httpError(504, 'Shadow calculation timed out. Please try again.');
    }
    throw error;
  }
}

module.exports = { withStatementTimeout };
