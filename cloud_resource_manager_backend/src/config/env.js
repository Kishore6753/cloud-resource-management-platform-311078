/**
 * Environment configuration helpers.
 * Centralizes environment variable access to avoid scattered process.env usage.
 */

/**
 * PUBLIC_INTERFACE
 * Get an environment variable or throw an error if it is missing/empty.
 * @param {string} name environment variable name
 * @returns {string} value
 */
function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * PUBLIC_INTERFACE
 * Get an environment variable or fallback to a default value.
 * @param {string} name environment variable name
 * @param {string} defaultValue fallback value
 * @returns {string} value
 */
function getEnv(name, defaultValue) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    return defaultValue;
  }
  return value;
}

module.exports = {
  getRequiredEnv,
  getEnv,
};
