const { logger } = require('../utils/logger');

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function attempt(url, { timeoutMs, ...init }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Timed out after ${timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url, { retries = 3, retryDelayMs = 2000, ...options } = {}) {
  for (let tryNumber = 1; ; tryNumber += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await attempt(url, { timeoutMs: 120000, ...options });
    } catch (error) {
      const retryable = !error.status || error.status >= 500 || error.status === 429;
      if (!retryable || tryNumber > retries) throw error;
      logger.warn(`Request failed (${error.message}); retry ${tryNumber}/${retries}`);
      // eslint-disable-next-line no-await-in-loop
      await wait(retryDelayMs * tryNumber);
    }
  }
}

module.exports = { fetchJsonWithRetry };
