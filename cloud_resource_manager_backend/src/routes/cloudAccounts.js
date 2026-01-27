const express = require('express');
const cloudAccountsController = require('../controllers/cloudAccounts');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireOrgContext, requireOrgRole } = require('../middleware');

const router = express.Router();

/**
 * @swagger
 * /api/cloud-accounts:
 *   get:
 *     summary: List cloud accounts (org-scoped)
 *     tags: [Cloud Accounts]
 *     description: List cloud accounts for the current organization context. Provide X-Org-Id header.
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
 *     responses:
 *       200:
 *         description: Cloud accounts list
 */
router.get(
  '/',
  authenticate,
  requireOrgContext,
  requireOrgRole('viewer'),
  asyncHandler(cloudAccountsController.list.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts:
 *   post:
 *     summary: Create a cloud account (org admin)
 *     tags: [Cloud Accounts]
 *     description: Creates a cloud account in the current org. Optionally includes credentialType + credentialData to store encrypted credentials.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: X-Org-Id
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, accountName]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [aws, azure, gcp]
 *               accountName:
 *                 type: string
 *                 example: Acme AWS Prod
 *               accountNumber:
 *                 type: string
 *                 example: 123456789012
 *               accountEmail:
 *                 type: string
 *                 example: billing@acme.com
 *               isActive:
 *                 type: boolean
 *                 example: true
 *               syncFrequency:
 *                 type: integer
 *                 description: Sync frequency in minutes
 *                 example: 360
 *               credentialType:
 *                 type: string
 *                 example: access_key
 *               credentialData:
 *                 type: object
 *                 description: Provider-specific credential payload; stored encrypted and never returned
 *                 example:
 *                   accessKeyId: AKIA...
 *                   secretAccessKey: ...
 *     responses:
 *       201:
 *         description: Cloud account created
 */
router.post(
  '/',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(cloudAccountsController.create.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}:
 *   get:
 *     summary: Get a cloud account (org-scoped)
 *     tags: [Cloud Accounts]
 *     description: Returns cloud account details (without secrets). Must belong to the current org context.
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
 *         description: Cloud account
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  authenticate,
  requireOrgContext,
  requireOrgRole('viewer'),
  asyncHandler(cloudAccountsController.get.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}:
 *   put:
 *     summary: Update a cloud account (org admin)
 *     tags: [Cloud Accounts]
 *     description: Updates account fields. To rotate credentials, supply credentialType + credentialData.
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountName:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               accountEmail:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               syncFrequency:
 *                 type: integer
 *               credentialType:
 *                 type: string
 *               credentialData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated cloud account
 */
router.put(
  '/:id',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(cloudAccountsController.update.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}:
 *   delete:
 *     summary: Delete a cloud account (org admin)
 *     tags: [Cloud Accounts]
 *     description: Deletes a cloud account (cascades credentials/resources).
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
 *         description: Deleted
 */
router.delete(
  '/:id',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(cloudAccountsController.remove.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}/credentials:
 *   get:
 *     summary: Get credential summary (no secrets)
 *     tags: [Cloud Accounts]
 *     description: Returns credential status metadata for the cloud account. Never returns secrets.
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
 *         description: Credential summary
 */
router.get(
  '/:id/credentials',
  authenticate,
  requireOrgContext,
  requireOrgRole('viewer'),
  asyncHandler(cloudAccountsController.getCredentials.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}/credentials:
 *   put:
 *     summary: Upsert/rotate credentials (org admin)
 *     tags: [Cloud Accounts]
 *     description: Stores new encrypted credentials for an account. Secrets are never returned.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credentialData]
 *             properties:
 *               credentialType:
 *                 type: string
 *               credentialData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Credential updated
 */
router.put(
  '/:id/credentials',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(cloudAccountsController.putCredentials.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}/verify-credentials:
 *   post:
 *     summary: Verify credentials format (org admin)
 *     tags: [Cloud Accounts]
 *     description: Decrypts stored credentials and validates required fields (format-only; no provider API calls).
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
 *         description: Verification result
 */
router.post(
  '/:id/verify-credentials',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(cloudAccountsController.verifyCredentials.bind(cloudAccountsController))
);

/**
 * @swagger
 * /api/cloud-accounts/{id}/sync:
 *   post:
 *     summary: Trigger a mock sync (org admin)
 *     tags: [Cloud Accounts]
 *     description: Mock sync that updates sync status and timestamps (used for UI flows until real provider integration).
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
 *         description: Sync triggered
 */
router.post(
  '/:id/sync',
  authenticate,
  requireOrgContext,
  requireOrgRole('admin'),
  asyncHandler(cloudAccountsController.syncNow.bind(cloudAccountsController))
);

module.exports = router;
