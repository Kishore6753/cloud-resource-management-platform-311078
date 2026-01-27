const resourcesService = require('../services/resources');

class ResourcesController {
  /**
   * PUBLIC_INTERFACE
   * List resources for current org with filtering/sorting/pagination.
   */
  async list(req, res) {
    const orgId = req.auth.org.id;
    const result = await resourcesService.listResources(orgId, req.query || {});
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Get a single resource detail for current org.
   */
  async get(req, res) {
    const orgId = req.auth.org.id;
    const result = await resourcesService.getResource(orgId, req.params.id);
    return res.status(200).json(result);
  }
}

module.exports = new ResourcesController();
