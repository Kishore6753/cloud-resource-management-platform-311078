const { pool, query } = require('../db');
const { ApiError } = require('../utils/errors');
const { slugify } = require('../utils/slug');

function sanitizeOrg(row, membershipRole) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    ownerId: row.owner_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: membershipRole,
  };
}

async function getMembership(userId, orgId) {
  const result = await query(
    `SELECT m.role AS org_role, o.*
     FROM user_organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1 AND m.organization_id = $2`,
    [userId, orgId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    orgRole: row.org_role,
    org: row,
  };
}

class OrganizationsService {
  /**
   * PUBLIC_INTERFACE
   * List organizations for the current user.
   * @param {string} userId user id
   * @returns {Promise<any[]>}
   */
  async list(userId) {
    const result = await query(
      `SELECT o.*, m.role AS org_role
       FROM user_organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );

    return result.rows.map((r) => sanitizeOrg(r, r.org_role));
  }

  /**
   * PUBLIC_INTERFACE
   * Create a new organization and add creator as admin.
   * @param {string} userId user id
   * @param {{ name: string, slug?: string, description?: string }} input
   * @returns {Promise<any>}
   */
  async create(userId, input) {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new ApiError(400, 'Organization name is required', 'VALIDATION_ERROR');
    }

    const baseSlug = slugify(input.slug || name);
    const slug = baseSlug || `org-${Date.now()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `INSERT INTO organizations (name, slug, description, owner_id, settings)
         VALUES ($1, $2, $3, $4, '{}'::jsonb)
         RETURNING *`,
        [name, slug, input.description || null, userId]
      );

      const org = inserted.rows[0];

      await client.query(
        `INSERT INTO user_organization_members (user_id, organization_id, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [userId, org.id]
      );

      await client.query('COMMIT');
      return sanitizeOrg(org, 'admin');
    } catch (e) {
      await client.query('ROLLBACK');
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
   * Get organization details for a member.
   * @param {string} userId user id
   * @param {string} orgId organization id
   * @returns {Promise<any>}
   */
  async get(userId, orgId) {
    const membership = await getMembership(userId, orgId);
    if (!membership) {
      throw new ApiError(403, 'Not a member of this organization', 'ORG_FORBIDDEN');
    }
    return sanitizeOrg(membership.org, membership.orgRole);
  }

  /**
   * PUBLIC_INTERFACE
   * Update organization (org admins or owner).
   * @param {string} userId user id
   * @param {string} orgId organization id
   * @param {{ name?: string, description?: string }} input update payload
   * @returns {Promise<any>}
   */
  async update(userId, orgId, input) {
    const membership = await getMembership(userId, orgId);
    if (!membership) {
      throw new ApiError(403, 'Not a member of this organization', 'ORG_FORBIDDEN');
    }

    const isOwner = membership.org.owner_id === userId;
    const isAdmin = membership.orgRole === 'admin';

    if (!isOwner && !isAdmin) {
      throw new ApiError(403, 'Insufficient role', 'RBAC_FORBIDDEN');
    }

    const name = input.name !== undefined ? String(input.name).trim() : undefined;
    const description =
      input.description !== undefined ? String(input.description).trim() : undefined;

    const updated = await query(
      `UPDATE organizations
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name || null, description || null, orgId]
    );

    return sanitizeOrg(updated.rows[0], membership.orgRole);
  }

  /**
   * PUBLIC_INTERFACE
   * Delete organization (owner only).
   * @param {string} userId user id
   * @param {string} orgId organization id
   * @returns {Promise<{ ok: true }>}
   */
  async remove(userId, orgId) {
    const membership = await getMembership(userId, orgId);
    if (!membership) {
      throw new ApiError(403, 'Not a member of this organization', 'ORG_FORBIDDEN');
    }

    const isOwner = membership.org.owner_id === userId;
    if (!isOwner) {
      throw new ApiError(403, 'Only the organization owner can delete it', 'RBAC_FORBIDDEN');
    }

    await query('DELETE FROM organizations WHERE id = $1', [orgId]);
    return { ok: true };
  }

  /**
   * PUBLIC_INTERFACE
   * List members of an organization (any member can view).
   * @param {string} orgId organization id
   * @returns {Promise<any[]>}
   */
  async listMembers(orgId) {
    const result = await query(
      `SELECT m.id AS membership_id, m.role AS org_role, m.joined_at,
              u.id AS user_id, u.email, u.username, u.full_name, u.avatar_url, u.role AS global_role, u.is_active
       FROM user_organization_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
       ORDER BY m.joined_at ASC`,
      [orgId]
    );

    return result.rows.map((r) => ({
      membershipId: r.membership_id,
      role: r.org_role,
      joinedAt: r.joined_at,
      user: {
        id: r.user_id,
        email: r.email,
        username: r.username,
        fullName: r.full_name,
        avatarUrl: r.avatar_url,
        globalRole: r.global_role,
        isActive: r.is_active,
      },
    }));
  }

  /**
   * PUBLIC_INTERFACE
   * Add a member to an org (admin only; enforced at route layer).
   * @param {string} orgId organization id
   * @param {{ email: string, role: 'admin'|'member'|'viewer' }} input
   * @returns {Promise<any>}
   */
  async addMember(orgId, input) {
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || 'member');

    if (!email) {
      throw new ApiError(400, 'Member email is required', 'VALIDATION_ERROR');
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      throw new ApiError(400, 'Invalid role', 'VALIDATION_ERROR', {
        allowed: ['admin', 'member', 'viewer'],
      });
    }

    const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rowCount === 0) {
      throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const userId = userResult.rows[0].id;

    await query(
      `INSERT INTO user_organization_members (user_id, organization_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, orgId, role]
    );

    return { ok: true };
  }

  /**
   * PUBLIC_INTERFACE
   * Remove a member from an org (admin only; enforced at route layer).
   * Accepts either membership id or user id in memberId.
   * @param {string} orgId org id
   * @param {string} memberId membership id OR user id
   * @returns {Promise<any>}
   */
  async removeMember(orgId, memberId) {
    const orgResult = await query('SELECT owner_id FROM organizations WHERE id = $1', [
      orgId,
    ]);
    if (orgResult.rowCount === 0) {
      throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
    }
    const ownerId = orgResult.rows[0].owner_id;

    // Prevent removing owner membership
    const ownerMembership = await query(
      'SELECT id FROM user_organization_members WHERE organization_id = $1 AND user_id = $2',
      [orgId, ownerId]
    );

    if (
      ownerMembership.rowCount > 0 &&
      (ownerMembership.rows[0].id === memberId || ownerId === memberId)
    ) {
      throw new ApiError(400, 'Cannot remove organization owner', 'ORG_OWNER_PROTECTED');
    }

    const result = await query(
      `DELETE FROM user_organization_members
       WHERE organization_id = $1 AND (id = $2 OR user_id = $2)`,
      [orgId, memberId]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Member not found', 'ORG_MEMBER_NOT_FOUND');
    }

    return { ok: true };
  }
}

module.exports = new OrganizationsService();
