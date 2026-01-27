const express = require('express');
const meController = require('../controllers/me');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate } = require('../middleware');

const router = express.Router();

/**
 * @swagger
 * /api/me:
 *   get:
 *     summary: Get current user profile and org memberships
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, asyncHandler(meController.getMe.bind(meController)));

module.exports = router;
