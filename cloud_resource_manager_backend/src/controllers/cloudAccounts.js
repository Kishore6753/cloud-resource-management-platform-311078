const cloudAccountsService = require('../services/cloudAccounts');

class CloudAccountsController {
  /**
   * PUBLIC_INTERFACE
   * List cloud accounts for current org.
   */
  async list(req, res) {
    const orgId = req.auth.org.id;
    const { limit, offset } = req.query || {};
    const result = await cloudAccountsService.list(orgId, { limit, offset });
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Create a cloud account for current org.
   */
  async create(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;
    const result = await cloudAccountsService.create(orgId, userId, req.body || {});
    return res.status(201).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Get a cloud account by id (must belong to current org).
   */
  async get(req, res) {
    const orgId = req.auth.org.id;
    const result = await cloudAccountsService.get(orgId, req.params.id);
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Update a cloud account by id (must belong to current org).
   */
  async update(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;
    const result = await cloudAccountsService.update(orgId, userId, req.params.id, req.body || {});
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Delete a cloud account by id (must belong to current org).
   */
  async remove(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;
    const result = await cloudAccountsService.remove(orgId, userId, req.params.id);
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Get credential summary for a cloud account.
   */
  async getCredentials(req, res) {
    const orgId = req.auth.org.id;
    const result = await cloudAccountsService.getCredentialSummary(orgId, req.params.id);
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Upsert/rotate credentials for a cloud account.
   */
  async putCredentials(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;
    const result = await cloudAccountsService.putCredentials(orgId, userId, req.params.id, req.body || {});
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Verify credentials format for a cloud account.
   */
  async verifyCredentials(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;
    const result = await cloudAccountsService.verifyCredentials(orgId, userId, req.params.id);
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Trigger a mock sync for a cloud account.
   */
  async syncNow(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;
    const result = await cloudAccountsService.syncNow(orgId, userId, req.params.id);
    return res.status(200).json(result);
  }
}

module.exports = new CloudAccountsController();
