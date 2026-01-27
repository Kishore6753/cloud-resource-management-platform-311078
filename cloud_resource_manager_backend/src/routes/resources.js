const express = require('express');
const resourcesController = require('../controllers/resources');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireOrgContext, requireOrgRole } = require('../middleware');

const router = express.Router();

/**
 * @swagger
 * /api/resources:
 *   get:
 *     summary: List resources (org-scoped)
 *     tags: [Resources]
 *     description: >
 *       Returns the resource inventory for the current organization.
 *       Supports filtering, sorting, and pagination.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: X-Org-Id
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 50
 *       - name: offset
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 0
 *       - name: provider
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [aws, azure, gcp]
 *       - name: cloudAccountId
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: resourceType
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: region
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: state
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: tagKey
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: tagValue
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: createdAt
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Resource list
 */
router.get(
  '/',
  authenticate,
  requireOrgContext,
  requireOrgRole('viewer'),
  asyncHandler(resourcesController.list.bind(resourcesController))
);

/**
 * @swagger
 * /api/resources/{id}:
 *   get:
 *     summary: Get resource details (org-scoped)
 *     tags: [Resources]
 *     description: Returns a resource by DB id, including recent cost breakdowns (if any).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: X-Org-Id
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resource details
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  authenticate,
  requireOrgContext,
  requireOrgRole('viewer'),
  asyncHandler(resourcesController.get.bind(resourcesController))
);

module.exports = router;
