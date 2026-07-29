const client = require('prom-client');

// Default Node.js metrics
client.collectDefaultMetrics();

// HTTP request metrics
const httpRequestsTotal = new client.Counter({
  name: 'shipping_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'service']
});
const httpErrorsTotal = new client.Counter({
  name: 'shipping_http_errors_total',
  help: 'Total number of HTTP error responses',
  labelNames: ['method', 'route', 'status', 'service']
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'shipping_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'service'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2]
});

// Business metrics
const shipmentsCreated = new client.Counter({
  name: 'shipments_created_total',
  help: 'Total number of shipments created successfully'
});
// Circuit breaker metrics
const circuitBreakerState = new client.Gauge({
  name: 'shipping_circuit_breaker_state',
  help: 'Circuit breaker state: 0 closed, 1 open, 2 half-open'
});
const circuitBreakerOpen = new client.Counter({
  name: 'shipping_circuit_breaker_open_total',
  help: 'Number of times the circuit breaker opened'
});
const circuitBreakerClose = new client.Counter({
  name: 'shipping_circuit_breaker_close_total',
  help: 'Number of times the circuit breaker closed'
});
const circuitBreakerHalfOpen = new client.Counter({
  name: 'shipping_circuit_breaker_half_open_total',
  help: 'Number of times the circuit breaker moved to half-open'
});

// Retry & timeout metrics
const retryAttempts = new client.Counter({ name: 'shipping_retry_attempts_total', help: 'Number of retry attempts' });
const timeoutErrors = new client.Counter({ name: 'shipping_timeout_errors_total', help: 'Number of timeout errors' });
const ShippingRejectedRequests = new client.Counter({
  name: 'shipping_rejected_requests_total',
  help: 'Requests rejected due to circuit breaker or retries'
});

module.exports = {
  client,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDurationSeconds,
  shipmentsCreated,
  circuitBreakerState,
  circuitBreakerClose,
  circuitBreakerHalfOpen,
  circuitBreakerOpen,
  retryAttempts,
  timeoutErrors,
  ShippingRejectedRequests
};
