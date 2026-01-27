const { getEnv } = require('../config/env');
const resourceDiscovery = require('../services/resourceDiscovery');

let intervalHandle = null;

/**
 * PUBLIC_INTERFACE
 * Start the in-process resource discovery scheduler (mock).
 *
 * Env vars (optional):
 *  - DISCOVERY_SCHEDULER_ENABLED: "true" to enable (default: "false")
 *  - DISCOVERY_SCHEDULER_INTERVAL_MS: interval in ms (default: 60000)
 *  - DISCOVERY_SCHEDULER_BATCH_LIMIT: number of due accounts per tick (default: 25)
 *
 * @returns {NodeJS.Timeout|null} interval handle if started
 */
function startResourceDiscoveryScheduler() {
  const enabled = String(getEnv('DISCOVERY_SCHEDULER_ENABLED', 'false')).toLowerCase() === 'true';
  if (!enabled) return null;

  const intervalMsRaw = Number(getEnv('DISCOVERY_SCHEDULER_INTERVAL_MS', '60000'));
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(5000, intervalMsRaw) : 60000;

  const batchLimitRaw = Number(getEnv('DISCOVERY_SCHEDULER_BATCH_LIMIT', '25'));
  const batchLimit = Number.isFinite(batchLimitRaw) ? Math.max(1, batchLimitRaw) : 25;

  if (intervalHandle) return intervalHandle;

  intervalHandle = setInterval(() => {
    resourceDiscovery
      .runDueDiscoveries({ limit: batchLimit })
      .catch((err) => console.error('Discovery scheduler tick failed:', err));
  }, intervalMs);

  // Allow process to exit naturally if this is the only pending handle.
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }

  // eslint-disable-next-line no-console
  console.log(
    `Resource discovery scheduler enabled: interval=${intervalMs}ms batchLimit=${batchLimit}`
  );

  return intervalHandle;
}

/**
 * PUBLIC_INTERFACE
 * Stop the in-process discovery scheduler if running.
 * @returns {void}
 */
function stopResourceDiscoveryScheduler() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = {
  startResourceDiscoveryScheduler,
  stopResourceDiscoveryScheduler,
};
