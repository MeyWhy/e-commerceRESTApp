const express = require('express');
const { v4: uuidv4 } = require('uuid');
const routes = require('./routesNotification.js');
const startConsumer = require('./consumer.js');
const dotenv = require('dotenv');
const logger = require('./logger.js');
const metrics = require('./metrics');

dotenv.config();

// Start RabbitMQ consumer
startConsumer();

const app = express();
app.use(express.json());

// Correlation ID middleware
app.use((req, res, next) => {
  const correlationId = req.header("X-Correlation-ID") || uuidv4();
  req.correlationId = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);
  next();
});

// Log every request
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
      correlationId: req.correlationId
    });
  });

  next();
});
const { httpRequestsTotal, httpRequestDurationSeconds, httpErrorsTotal } = require('./metrics');

app.use((req, res, next) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status: res.statusCode, service: 'notification-service' };
    httpRequestsTotal.inc(labels);
    end();
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });
  next();
});


app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.client.register.contentType);
  res.end(await metrics.client.register.metrics());
});

// Routes
app.use('/api/', routes);

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  logger.info({
    message: "Notification service started",
    port: PORT
  });
});
