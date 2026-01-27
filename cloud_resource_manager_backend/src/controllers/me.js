const { query } = require('../db');

function sanitizeUser(row) {
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

class MeController {
  /**
   * PUBLIC_INTERFACE
   * Get the authenticated user's profile and org memberships.
   */
  async getMe(req, res) {
    const userId = req.auth.user.id;

    const userResult = await query(
      `SELECT id, email, username, full_name, avatar_url, role, is_active, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    const orgsResult = await query(
      `SELECT o.id, o.name, o.slug, o.owner_id, m.role AS org_role
       FROM user_organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1
       ORDER BY o.created_at ASC`,
      [userId]
    );

    return res.status(200).json({
      user: sanitizeUser(userResult.rows[0]),
      orgs: orgsResult.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        ownerId: r.owner_id,
        role: r.org_role,
      })),
    });
  }
}

module.exports = new MeController();
