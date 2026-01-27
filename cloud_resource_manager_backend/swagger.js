const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cloud Resource Manager API',
      version: '0.1.0',
      description:
        'Backend API for authentication, organization isolation, RBAC, and cloud resource management.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Provide an access token as: Authorization: Bearer <token>. Org-scoped endpoints also support X-Org-Id header.',
        },
      },
    },
    tags: [
      { name: 'System', description: 'System and health endpoints' },
      { name: 'Auth', description: 'Authentication and session management' },
      { name: 'Users', description: 'User profile endpoints' },
      { name: 'Organizations', description: 'Organization and membership management' },
      { name: 'Cloud Accounts', description: 'Cloud account linking and credential management' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
