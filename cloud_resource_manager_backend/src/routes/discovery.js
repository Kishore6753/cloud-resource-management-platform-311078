const express = require('express');
const discoveryController = require('../controllers/discovery');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireOrgContext, requireOrgRole } = require('../middleware');

const router = express.Router();

/**
 * @swagger
 * /api/discovery/run:
 *   post:
 *     summary: Run mock resource discovery for all cloud accounts in the org (org admin)
 *     tags: [Discovery]
 *     description: >
 *       Triggers a mock resource discovery job across all active cloud accounts in the current org.
 *       This populates/updates the resources inventory for UI flows until real provider integrations are added.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: X-Org-Id
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discovery run results
 */
router.post(
  '/run',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(discoveryController.runForOrg.bind(discoveryController))
);

module.exports = router;
