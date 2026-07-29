const client = require('prom-client');

// Collect default Node.js process metrics
client.collectDefaultMetrics();

// HTTP metrics
const httpRequestsTotal = new client.Counter({
  name: 'inventory_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status', 'service']
});
const httpErrorsTotal = new client.Counter({
  name: 'inventory_http_errors_total',
  help: 'Total number of HTTP error responses',
  labelNames: ['method', 'route', 'status', 'service']
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'inventory_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status', 'service'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2]
});

// Business metrics
const productsCreated = new client.Counter({
  name: 'inventory_products_created_total',
  help: 'Total number of products successfully created'
});

const productsUpdated = new client.Counter({
  name: 'inventory_products_updated_total',
  help: 'Total number of products successfully updated'
});

const productsDeleted = new client.Counter({
  name: 'inventory_products_deleted_total',
  help: 'Total number of products successfully deleted'
});

const stockValidated = new client.Counter({
  name: 'inventory_stock_validated_total',
  help: 'Total number of stock validation requests'
});
const inventoryLowStockAlerts = new client.Counter({
  name: 'inventory_low_stock_alerts_total',
  help: 'Total number of low stock alerts triggered'
});

module.exports = {
  client,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDurationSeconds,
  productsCreated,
  productsUpdated,
  productsDeleted,
  inventoryLowStockAlerts,
  stockValidated
};
