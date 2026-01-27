const { pool, query } = require('../db');
const { ApiError } = require('../utils/errors');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { slugify } = require('../utils/slug');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    isActive: row.is_active,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserOrganizations(userId) {
  const result = await query(
    `SELECT o.id, o.name, o.slug, o.owner_id, m.role AS org_role
     FROM user_organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1
     ORDER BY o.created_at ASC`,
    [userId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    ownerId: r.owner_id,
    role: r.org_role,
  }));
}

function pickDefaultOrg(orgs, requestedOrgId) {
  if (!orgs || orgs.length === 0) return null;
  if (requestedOrgId) {
    const found = orgs.find((o) => o.id === requestedOrgId);
    if (found) return found;
  }
  return orgs[0];
}

class AuthService {
  /**
   * PUBLIC_INTERFACE
   * Register a user and create an initial organization.
   * @param {{ email: string, username: string, password: string, fullName?: string, organizationName?: string, organizationSlug?: string }} input
   * @returns {Promise<any>} auth response with tokens
   */
  async register(input) {
    const email = normalizeEmail(input.email);
    const username = String(input.username || '').trim();
    const password = String(input.password || '');

    if (!email || !username || password.length < 6) {
      throw new ApiError(400, 'Invalid registration payload', 'VALIDATION_ERROR', {
        hints: ['email required', 'username required', 'password min length 6'],
      });
    }

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.rowCount > 0) {
      throw new ApiError(409, 'User already exists', 'USER_EXISTS');
    }

    const passwordHash = await hashPassword(password);

    const organizationName =
      String(input.organizationName || '').trim() || `${username} Organization`;
    const requestedSlug = String(input.organizationSlug || '').trim();
    const baseSlug = slugify(requestedSlug || organizationName || username);
    const orgSlug = baseSlug || slugify(username) || `org-${Date.now()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userInsert = await client.query(
        `INSERT INTO users (email, username, password_hash, full_name, role, email_verified)
         VALUES ($1, $2, $3, $4, 'user', true)
         RETURNING id, email, username, full_name, avatar_url, role, is_active, email_verified, created_at, updated_at`,
        [email, username, passwordHash, input.fullName || null]
      );

      const user = userInsert.rows[0];

      const orgInsert = await client.query(
        `INSERT INTO organizations (name, slug, description, owner_id, settings)
         VALUES ($1, $2, $3, $4, '{}'::jsonb)
         RETURNING id, name, slug, description, owner_id, is_active, created_at, updated_at`,
        [organizationName, orgSlug, null, user.id]
      );

      const org = orgInsert.rows[0];

      await client.query(
        `INSERT INTO user_organization_members (user_id, organization_id, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [user.id, org.id]
      );

      await client.query('COMMIT');

      const orgs = await getUserOrganizations(user.id);
      const defaultOrg = pickDefaultOrg(orgs, org.id);

      const access = signAccessToken({
        userId: user.id,
        email: user.email,
        username: user.username,
        globalRole: user.role,
        orgId: defaultOrg ? defaultOrg.id : null,
        orgRole: defaultOrg ? defaultOrg.role : null,
      });
      const refresh = signRefreshToken({ userId: user.id });

      return {
        user: sanitizeUserRow(user),
        org: defaultOrg,
        orgs,
        tokens: {
          tokenType: 'Bearer',
          accessToken: access.token,
          refreshToken: refresh.token,
          accessExpiresIn: access.expiresIn,
          refreshExpiresIn: refresh.expiresIn,
        },
      };
    } catch (e) {
      await client.query('ROLLBACK');

      // likely slug conflict or unique constraint
      if (String(e && e.message).toLowerCase().includes('duplicate key')) {
        throw new ApiError(409, 'Organization slug already exists', 'ORG_SLUG_EXISTS');
      }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Login with email and password; returns JWT tokens and org memberships.
   * @param {{ email: string, password: string, orgId?: string }} input
   * @returns {Promise<any>}
   */
  async login(input) {
    const email = normalizeEmail(input.email);
    const password = String(input.password || '');

    if (!email || !password) {
      throw new ApiError(400, 'Email and password required', 'VALIDATION_ERROR');
    }

    const userResult = await query(
      `SELECT id, email, username, password_hash, full_name, avatar_url, role, is_active, email_verified, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (userResult.rowCount === 0) {
      throw new ApiError(401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw new ApiError(403, 'User is inactive', 'USER_INACTIVE');
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      throw new ApiError(401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    const orgs = await getUserOrganizations(user.id);
    const defaultOrg = pickDefaultOrg(orgs, input.orgId);

    const access = signAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      globalRole: user.role,
      orgId: defaultOrg ? defaultOrg.id : null,
      orgRole: defaultOrg ? defaultOrg.role : null,
    });
    const refresh = signRefreshToken({ userId: user.id });

    return {
      user: sanitizeUserRow(user),
      org: defaultOrg,
      orgs,
      tokens: {
        tokenType: 'Bearer',
        accessToken: access.token,
        refreshToken: refresh.token,
        accessExpiresIn: access.expiresIn,
        refreshExpiresIn: refresh.expiresIn,
      },
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Refresh an access token using a refresh token.
   * @param {{ refreshToken: string, orgId?: string }} input
   * @returns {Promise<any>}
   */
  async refresh(input) {
    const refreshToken = String(input.refreshToken || '');
    if (!refreshToken) {
      throw new ApiError(400, 'refreshToken is required', 'VALIDATION_ERROR');
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (e) {
      throw new ApiError(401, 'Invalid or expired refresh token', 'REFRESH_INVALID');
    }

    const userId = decoded.sub;

    const userResult = await query(
      `SELECT id, email, username, full_name, avatar_url, role, is_active, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      throw new ApiError(401, 'User not found', 'AUTH_USER_NOT_FOUND');
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw new ApiError(403, 'User is inactive', 'USER_INACTIVE');
    }

    const orgs = await getUserOrganizations(user.id);
    const defaultOrg = pickDefaultOrg(orgs, input.orgId);

    const access = signAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      globalRole: user.role,
      orgId: defaultOrg ? defaultOrg.id : null,
      orgRole: defaultOrg ? defaultOrg.role : null,
    });

    return {
      tokenType: 'Bearer',
      accessToken: access.token,
      accessExpiresIn: access.expiresIn,
      org: defaultOrg,
      orgs,
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Logout endpoint placeholder. With stateless JWTs, logout is client-side by discarding tokens.
   * (Future hardening can add refresh token rotation + storage for revocation.)
   * @returns {Promise<{ ok: true }>}
   */
  async logout() {
    return { ok: true };
  }
}

module.exports = new AuthService();
