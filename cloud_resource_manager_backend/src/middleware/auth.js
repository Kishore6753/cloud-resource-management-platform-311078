const { query } = require('../db');
const { ApiError } = require('../utils/errors');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/jwt');

const roleRank = {
  viewer: 1,
  member: 2,
  admin: 3,
};

function parseBearerToken(headerValue) {
  if (!headerValue) return null;
  const parts = String(headerValue).split(' ');
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

/**
 * PUBLIC_INTERFACE
 * Authenticate requests using a Bearer access token.
 * Attaches req.auth.user = { id, email, username, role } and token-derived org hints.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    throw new ApiError(401, 'Missing Authorization header', 'AUTH_MISSING');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (e) {
    throw new ApiError(401, 'Invalid or expired token', 'AUTH_INVALID');
  }

  req.auth = {
    user: {
      id: decoded.sub,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
    },
    tokenOrgId: decoded.orgId || null,
    tokenOrgRole: decoded.orgRole || null,
  };

  next();
});

function resolveOrgIdFromRequest(req) {
  return (
    req.headers['x-org-id'] ||
    req.headers['x-organization-id'] ||
    req.query.orgId ||
    req.body.orgId ||
    (req.auth ? req.auth.tokenOrgId : null) ||
    null
  );
}

/**
 * PUBLIC_INTERFACE
 * Require org membership and load the org context.
 * Uses orgId from X-Org-Id (preferred) or ?orgId or body.orgId or token orgId.
 * Attaches req.auth.org = { id, name, slug, role, ownerId }.
 */
const requireOrgContext = asyncHandler(async (req, res, next) => {
  const orgId = resolveOrgIdFromRequest(req);
  if (!orgId) {
    throw new ApiError(
      400,
      'Organization context required (provide X-Org-Id header)',
      'ORG_REQUIRED'
    );
  }

  const membership = await query(
    `SELECT m.role AS org_role, o.id, o.name, o.slug, o.owner_id
     FROM user_organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND m.organization_id = $2`,
    [req.auth.user.id, orgId]
  );

  if (membership.rowCount === 0) {
    throw new ApiError(403, 'Not a member of this organization', 'ORG_FORBIDDEN');
  }

  const row = membership.rows[0];
  req.auth.org = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.org_role,
    ownerId: row.owner_id,
  };

  next();
});

/**
 * PUBLIC_INTERFACE
 * Resolve org context from a route param (e.g. :id) and enforce membership.
 * @param {string} paramName route param containing org id
 * @returns {import('express').RequestHandler}
 */
function requireOrgFromParam(paramName) {
  return asyncHandler(async (req, res, next) => {
    const orgId = req.params[paramName];
    req.headers['x-org-id'] = orgId; // normalize to org context resolver
    return requireOrgContext(req, res, next);
  });
}

/**
 * PUBLIC_INTERFACE
 * Enforce org role-based access (viewer < member < admin).
 * Must be used after requireOrgContext/requireOrgFromParam.
 * @param {'viewer'|'member'|'admin'} minimumRole minimum role required
 * @returns {import('express').RequestHandler}
 */
function requireOrgRole(minimumRole) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.org) {
      return next(new ApiError(500, 'Org context not loaded', 'ORG_CONTEXT_MISSING'));
    }

    const current = req.auth.org.role;
    const currentRank = roleRank[current] || 0;
    const requiredRank = roleRank[minimumRole] || 0;

    // Allow global admins to bypass org role checks (but still require org membership).
    const isGlobalAdmin = req.auth.user && req.auth.user.role === 'admin';

    if (!isGlobalAdmin && currentRank < requiredRank) {
      return next(new ApiError(403, 'Insufficient role for this action', 'RBAC_FORBIDDEN'));
    }

    return next();
  };
}

module.exports = {
  authenticate,
  requireOrgContext,
  requireOrgFromParam,
  requireOrgRole,
};
