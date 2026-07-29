const client = require('prom-client');

// Collect default Node.js process metrics
client.collectDefaultMetrics();

// HTTP metrics
const httpRequestsTotal = new client.Counter({
  name: 'order_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'service']
});
const httpErrorsTotal = new client.Counter({
  name: 'order_http_errors_total',
  help: 'Total number of HTTP error responses',
  labelNames: ['method', 'route', 'status', 'service']
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'order_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'service'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2]
});

// Business metrics
const ordersCreated = new client.Counter({
  name: 'orders_created_total',
  help: 'Total number of orders successfully created'
});

const ordersUpdated = new client.Counter({
  name: 'orders_updated_total',
  help: 'Total number of orders successfully updated'
});

const ordersDeleted = new client.Counter({
  name: 'orders_deleted_total',
  help: 'Total number of orders successfully deleted'
});
const ordersFailed = new client.Counter({
  name: 'orders_failed_total',
  help: 'Total number of order creation failures'
});

const productsSold = new client.Counter({
  name: 'products_sold_total',
  help: 'Total number of products sold',
  labelNames: ['product_name']
});
module.exports = {
  client,
  httpRequestsTotal, 
  httpErrorsTotal,
  httpRequestDurationSeconds,
  ordersCreated,
  ordersUpdated,
  ordersDeleted,
  ordersFailed,
  productsSold
};
