const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function defaultLevel() {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
}

function write(level, message) {
  const threshold = LEVELS[defaultLevel()] ?? LEVELS.info;
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`;
  (LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout).write(line);
}

const logger = {
  debug: (message) => write('debug', message),
  info: (message) => write('info', message),
  warn: (message) => write('warn', message),
  error: (message) => write('error', message)
};

module.exports = { logger };
