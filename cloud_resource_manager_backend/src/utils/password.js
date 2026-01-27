const bcrypt = require('bcryptjs');

/**
 * PUBLIC_INTERFACE
 * Hash a plaintext password for storage.
 * @param {string} plaintext plaintext password
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plaintext) {
  const saltRounds = 10;
  return bcrypt.hash(plaintext, saltRounds);
}

/**
 * PUBLIC_INTERFACE
 * Verify plaintext password against bcrypt hash.
 * @param {string} plaintext plaintext password
 * @param {string} passwordHash bcrypt hash
 * @returns {Promise<boolean>} is valid
 */
async function verifyPassword(plaintext, passwordHash) {
  return bcrypt.compare(plaintext, passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
