const client = require('prom-client');

// Collect default Node.js process metrics
client.collectDefaultMetrics();

// HTTP metrics
const httpRequestsTotal = new client.Counter({
  name: 'notification_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'service']
});
const httpErrorsTotal = new client.Counter({
  name: 'notification_http_errors_total',
  help: 'Total number of HTTP error responses',
  labelNames: ['method', 'route', 'status', 'service']
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'notification_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'service'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2]
});

// Business metrics
const notificationsSent = new client.Counter({
  name: 'notification_sent_total',
  help: 'Total number of notifications successfully sent'
});

module.exports = {
  client,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDurationSeconds,
  notificationsSent
};
