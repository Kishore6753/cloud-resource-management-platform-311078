const express = require('express');
const authController = require('../controllers/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (creates an initial organization)
 *     tags: [Auth]
 *     description: Creates a user and an initial organization, then returns access + refresh tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, username, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@acme.com
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: password
 *               fullName:
 *                 type: string
 *                 example: Acme Admin
 *               organizationName:
 *                 type: string
 *                 example: Acme Corp
 *               organizationSlug:
 *                 type: string
 *                 example: acme
 *     responses:
 *       201:
 *         description: Registered successfully
 */
router.post('/register', asyncHandler(authController.register.bind(authController)));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and obtain JWT tokens
 *     tags: [Auth]
 *     description: Logs in using email/password and returns access + refresh tokens plus org memberships.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@acme.com
 *               password:
 *                 type: string
 *                 example: password
 *               orgId:
 *                 type: string
 *                 description: Optional org id to select as default context for the access token
 *     responses:
 *       200:
 *         description: Logged in successfully
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', asyncHandler(authController.login.bind(authController)));

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     description: Exchange a refresh token for a new access token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *               orgId:
 *                 type: string
 *                 description: Optional org id to embed into the new access token
 *     responses:
 *       200:
 *         description: Access token refreshed
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', asyncHandler(authController.refresh.bind(authController)));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout (stateless)
 *     tags: [Auth]
 *     description: Stateless logout placeholder. Client should discard tokens. Future hardening can add refresh token rotation/revocation.
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', asyncHandler(authController.logout.bind(authController)));

module.exports = router;
