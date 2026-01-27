const express = require('express');
const healthController = require('../controllers/health');

const authRoutes = require('./auth');
const meRoutes = require('./me');
const organizationsRoutes = require('./organizations');
const cloudAccountsRoutes = require('./cloudAccounts');
const resourcesRoutes = require('./resources');
const discoveryRoutes = require('./discovery');

const router = express.Router();

// Health endpoint
/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

// API routes
router.use('/api/auth', authRoutes);
router.use('/api/me', meRoutes);
router.use('/api/organizations', organizationsRoutes);
router.use('/api/cloud-accounts', cloudAccountsRoutes);
router.use('/api/resources', resourcesRoutes);
router.use('/api/discovery', discoveryRoutes);

module.exports = router;
