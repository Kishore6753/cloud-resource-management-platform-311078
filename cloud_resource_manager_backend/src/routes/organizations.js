const express = require('express');
const organizationsController = require('../controllers/organizations');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireOrgFromParam, requireOrgRole } = require('../middleware');

const router = express.Router();

/**
 * @swagger
 * /api/organizations:
 *   get:
 *     summary: List organizations for the current user
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations
 */
router.get('/', authenticate, asyncHandler(organizationsController.list.bind(organizationsController)));

/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Acme Corp
 *               slug:
 *                 type: string
 *                 example: acme
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Organization created
 */
router.post('/', authenticate, asyncHandler(organizationsController.create.bind(organizationsController)));

/**
 * @swagger
 * /api/organizations/{id}:
 *   get:
 *     summary: Get an organization by id
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization
 *       403:
 *         description: Not a member
 */
router.get(
  '/:id',
  authenticate,
  requireOrgFromParam('id'),
  asyncHandler(organizationsController.get.bind(organizationsController))
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   put:
 *     summary: Update an organization (admin or owner)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated organization
 *       403:
 *         description: Forbidden
 */
router.put(
  '/:id',
  authenticate,
  requireOrgFromParam('id'),
  requireOrgRole('admin'),
  asyncHandler(organizationsController.update.bind(organizationsController))
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   delete:
 *     summary: Delete an organization (owner only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 */
router.delete(
  '/:id',
  authenticate,
  requireOrgFromParam('id'),
  requireOrgRole('admin'),
  asyncHandler(organizationsController.remove.bind(organizationsController))
);

/**
 * @swagger
 * /api/organizations/{id}/members:
 *   get:
 *     summary: List organization members
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Members list
 */
router.get(
  '/:id/members',
  authenticate,
  requireOrgFromParam('id'),
  asyncHandler(organizationsController.listMembers.bind(organizationsController))
);

/**
 * @swagger
 * /api/organizations/{id}/members:
 *   post:
 *     summary: Add/update an organization member (admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *             required: [email, role]
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member, viewer]
 *     responses:
 *       200:
 *         description: Member added/updated
 */
router.post(
  '/:id/members',
  authenticate,
  requireOrgFromParam('id'),
  requireOrgRole('admin'),
  asyncHandler(organizationsController.addMember.bind(organizationsController))
);

/**
 * @swagger
 * /api/organizations/{id}/members/{memberId}:
 *   delete:
 *     summary: Remove an organization member (admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: memberId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete(
  '/:id/members/:memberId',
  authenticate,
  requireOrgFromParam('id'),
  requireOrgRole('admin'),
  asyncHandler(organizationsController.removeMember.bind(organizationsController))
);

module.exports = router;
