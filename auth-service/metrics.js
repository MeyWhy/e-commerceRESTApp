const client = require('prom-client');

// Default metrics (Node.js process metrics)
client.collectDefaultMetrics();

// 1. Count every HTTP request
const httpRequestsTotal = new client.Counter({
  name: 'auth_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'service']
});
const httpErrorsTotal = new client.Counter({
  name: 'auth_http_errors_total',
  help: 'Total number of HTTP error responses',
  labelNames: ['method', 'route', 'status', 'service']
});

// 2. Histogram for response duration
const httpRequestDurationSeconds = new client.Histogram({
  name: 'auth_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'service'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2]
});

// 3. Business metrics
const usersRegistered = new client.Counter({
  name: 'auth_users_registered_total',
  help: 'Total users successfully registered'
});

const loginAttempts = new client.Counter({
  name: 'auth_login_attempts_total',
  help: 'Total login attempts'
});

const loginSuccess = new client.Counter({
  name: 'auth_login_success_total',
  help: 'Total successful logins'
});

const loginFailed = new client.Counter({
  name: 'auth_login_failed_total',
  help: 'Total failed login attempts'
});

module.exports = {
  client,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDurationSeconds,
  usersRegistered,
  loginAttempts,
  loginSuccess,
  loginFailed
};
