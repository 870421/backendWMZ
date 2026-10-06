const { sequelize } = require('../config/database');
const { logger } = require('../utils/logger');

function logSummary(summary) {
  const { dataset, status, sourceCount, imported, rejected, details } = summary;
  logger.info(
    `[${dataset}] ${status.toUpperCase()} run=${summary.runId} source=${sourceCount} imported=${imported} rejected=${rejected}`
  );
  logger.info(`[${dataset}] details ${JSON.stringify(details)}`);
  if (status !== 'success') {
    logger.error(
      `[${dataset}] imported + rejected (${imported + rejected}) != source (${sourceCount})`
    );
  }
}

/*
 * Runs import functions in order and sets a non-zero exit code if any of them fails or ends
 * in 'mismatch'. Later imports still run so one failing source does not hide the others.
 */
async function runImportsCli(importFunctions) {
  let ok = true;

  for (const importFunction of importFunctions) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const summary = await importFunction();
      logSummary(summary);
      ok = ok && summary.status === 'success';
    } catch (error) {
      logger.error(`Import failed: ${error.message}`);
      ok = false;
    }
  }
  await sequelize.close();
  process.exitCode = ok ? 0 : 1;
}

module.exports = { logSummary, runImportsCli };
