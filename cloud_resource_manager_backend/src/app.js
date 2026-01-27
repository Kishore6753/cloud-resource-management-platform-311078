const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');
const { errorHandler, notFoundHandler } = require('./utils/errors');

// Initialize express app
const app = express();

function parseCorsOrigins(value) {
  if (!value) return '*';
  const parts = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // For simple deployments, we allow a single origin or a list.
  // If '*' is present, treat it as open CORS.
  if (parts.includes('*')) return '*';
  return parts;
}

function buildDynamicSpec(req) {
  const host = req.get('host'); // may or may not include port
  let protocol = req.protocol; // http or https

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) || (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  return {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
}

app.set('trust proxy', true);

app.use(
  cors({
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-Id', 'X-Organization-Id'],
  })
);

app.use(helmet());

// Basic rate limiting (can be tightened later per Security Hardening phase)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

// Parse JSON request body
app.use(express.json({ limit: '1mb' }));

// Serve OpenAPI JSON (used by platform integration / docs tooling)
app.get('/openapi.json', (req, res) => {
  res.json(buildDynamicSpec(req));
});

// Swagger UI
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  swaggerUi.setup(buildDynamicSpec(req))(req, res, next);
});

// Mount routes
app.use('/', routes);

// 404 + error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
