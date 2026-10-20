const { sequelize } = require('../config/database');
const { runAssociation } = require('../services/geo/associationService');
const { logger } = require('../utils/logger');

const TYPE_ARGUMENTS = { trees: 'tree', buildings: 'building' };

// "--type=trees|buildings" selects one type; without it both are associated.
function parseTypes(argv) {
  const argument = argv.find((value) => value.startsWith('--type='));
  if (!argument) return Object.values(TYPE_ARGUMENTS);
  const type = TYPE_ARGUMENTS[argument.slice('--type='.length)];
  if (!type) throw new Error(`Unknown ${argument}; use --type=trees or --type=buildings`);
  return [type];
}

const round = (value, decimals = 1) =>
  value === null || value === undefined ? '-' : Number(value).toFixed(decimals);

function formatSummaries(summaries) {
  const rows = summaries.map((summary) => ({
    type: summary.type,
    status: summary.status,
    total: summary.total,
    'nearest<=max': summary.nearestOk,
    '%': round(summary.pctAssociated, 2),
    isolated: summary.isolated,
    no_segment: summary.noSegment,
    invalid_geom: summary.invalidGeometry,
    radius_links: summary.radiusLinks,
    'segments/element': round(summary.avgSegmentsPerElement, 2),
    mean_m: round(summary.meanDistanceM),
    p95_m: round(summary.p95DistanceM),
    seconds: round(summary.durationMs / 1000)
  }));
  const columns = Object.keys(rows[0] ?? {});
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column]).length))
  );
  const line = (values) => values.map((value, i) => String(value).padStart(widths[i])).join('  ');
  return [line(columns), ...rows.map((row) => line(columns.map((column) => row[column])))].join(
    '\n'
  );
}

/*
 * Returns the exit code: 0 only if every type is 'success' (reconciled and at least
 * ASSOC_MIN_PCT associated).
 */
async function runAssociateCli({
  argv = process.argv.slice(2),
  run = runAssociation,
  write = (text) => process.stdout.write(text)
} = {}) {
  try {
    const summaries = await run({ types: parseTypes(argv) });
    write(`${formatSummaries(summaries)}\n`);
    const failed = summaries.filter((summary) => summary.status !== 'success');
    failed.forEach((summary) =>
      logger.error(
        `[associate:${summary.type}] ${summary.status.toUpperCase()} run=${summary.runId}` +
          ` associated=${summary.nearestOk} unassociated=${summary.unassociated}` +
          ` total=${summary.total} overlap=${summary.overlap} orphans=${summary.orphans}`
      )
    );
    return failed.length === 0 ? 0 : 1;
  } catch (error) {
    logger.error(`Association failed: ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  runAssociateCli().then(async (exitCode) => {
    await sequelize.close();
    process.exitCode = exitCode;
  });
}

module.exports = { parseTypes, formatSummaries, runAssociateCli };
