const jwt = require('jsonwebtoken');
const { getEnv, getRequiredEnv } = require('../config/env');

function getJwtConfig() {
  const accessSecret = getEnv('JWT_SECRET', '');
  const refreshSecret = getEnv('JWT_REFRESH_SECRET', '');
  const accessExpiry = getEnv('JWT_EXPIRY', '24h');
  const refreshExpiry = getEnv('JWT_REFRESH_EXPIRY', '7d');

  return {
    accessSecret,
    refreshSecret,
    accessExpiry,
    refreshExpiry,
  };
}

/**
 * PUBLIC_INTERFACE
 * Sign an access token for API authorization.
 * @param {{ userId: string, email: string, username: string, globalRole: string, orgId?: string|null, orgRole?: string|null }} payload
 * @returns {{ token: string, expiresIn: string }}
 */
function signAccessToken(payload) {
  const { accessSecret, accessExpiry } = getJwtConfig();
  if (!accessSecret) {
    getRequiredEnv('JWT_SECRET');
  }

  const token = jwt.sign(
    {
      email: payload.email,
      username: payload.username,
      role: payload.globalRole,
      orgId: payload.orgId || null,
      orgRole: payload.orgRole || null,
      typ: 'access',
    },
    accessSecret,
    {
      subject: payload.userId,
      expiresIn: accessExpiry,
    }
  );

  return { token, expiresIn: accessExpiry };
}

/**
 * PUBLIC_INTERFACE
 * Sign a refresh token for session renewal.
 * @param {{ userId: string }} payload
 * @returns {{ token: string, expiresIn: string }}
 */
function signRefreshToken(payload) {
  const { refreshSecret, refreshExpiry } = getJwtConfig();
  if (!refreshSecret) {
    getRequiredEnv('JWT_REFRESH_SECRET');
  }

  const token = jwt.sign(
    {
      typ: 'refresh',
    },
    refreshSecret,
    {
      subject: payload.userId,
      expiresIn: refreshExpiry,
    }
  );

  return { token, expiresIn: refreshExpiry };
}

/**
 * PUBLIC_INTERFACE
 * Verify an access token and return decoded payload.
 * @param {string} token JWT token
 * @returns {any} decoded payload
 */
function verifyAccessToken(token) {
  const { accessSecret } = getJwtConfig();
  if (!accessSecret) {
    getRequiredEnv('JWT_SECRET');
  }
  return jwt.verify(token, accessSecret);
}

/**
 * PUBLIC_INTERFACE
 * Verify a refresh token and return decoded payload.
 * @param {string} token JWT token
 * @returns {any} decoded payload
 */
function verifyRefreshToken(token) {
  const { refreshSecret } = getJwtConfig();
  if (!refreshSecret) {
    getRequiredEnv('JWT_REFRESH_SECRET');
  }
  return jwt.verify(token, refreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
