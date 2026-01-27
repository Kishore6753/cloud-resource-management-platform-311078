const resourceDiscoveryService = require('../services/resourceDiscovery');

class DiscoveryController {
  /**
   * PUBLIC_INTERFACE
   * Trigger mock resource discovery across all active cloud accounts in the current org.
   */
  async runForOrg(req, res) {
    const orgId = req.auth.org.id;
    const userId = req.auth.user.id;

    const result = await resourceDiscoveryService.runDiscoveryForOrganization(orgId, userId);
    return res.status(200).json(result);
  }
}

module.exports = new DiscoveryController();
