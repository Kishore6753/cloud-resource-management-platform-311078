require('dotenv').config();

const app = require('./app');
const {
  startResourceDiscoveryScheduler,
  stopResourceDiscoveryScheduler,
} = require('./jobs/resourceDiscoveryScheduler');

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);

  // Optional scheduler (disabled by default; enable via DISCOVERY_SCHEDULER_ENABLED=true)
  startResourceDiscoveryScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopResourceDiscoveryScheduler();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = server;
