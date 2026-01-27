const organizationsService = require('../services/organizations');

class OrganizationsController {
  /**
   * PUBLIC_INTERFACE
   * List organizations for authenticated user.
   */
  async list(req, res) {
    const orgs = await organizationsService.list(req.auth.user.id);
    return res.status(200).json({ organizations: orgs });
  }

  /**
   * PUBLIC_INTERFACE
   * Create organization.
   */
  async create(req, res) {
    const org = await organizationsService.create(req.auth.user.id, req.body || {});
    return res.status(201).json({ organization: org });
  }

  /**
   * PUBLIC_INTERFACE
   * Get organization by id (member only).
   */
  async get(req, res) {
    const org = await organizationsService.get(req.auth.user.id, req.params.id);
    return res.status(200).json({ organization: org });
  }

  /**
   * PUBLIC_INTERFACE
   * Update organization (org admin or owner).
   */
  async update(req, res) {
    const org = await organizationsService.update(
      req.auth.user.id,
      req.params.id,
      req.body || {}
    );
    return res.status(200).json({ organization: org });
  }

  /**
   * PUBLIC_INTERFACE
   * Delete organization (owner only).
   */
  async remove(req, res) {
    const result = await organizationsService.remove(req.auth.user.id, req.params.id);
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * List organization members.
   */
  async listMembers(req, res) {
    const members = await organizationsService.listMembers(req.params.id);
    return res.status(200).json({ members });
  }

  /**
   * PUBLIC_INTERFACE
   * Add a member (org admin only).
   */
  async addMember(req, res) {
    const result = await organizationsService.addMember(req.params.id, req.body || {});
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Remove a member (org admin only).
   */
  async removeMember(req, res) {
    const result = await organizationsService.removeMember(
      req.params.id,
      req.params.memberId
    );
    return res.status(200).json(result);
  }
}

module.exports = new OrganizationsController();
