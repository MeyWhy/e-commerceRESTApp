const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = require('./routesPayments.js');
const dotenv = require('dotenv');
const logger = require('./logger.js');
const metrics = require('./metrics');

dotenv.config();

const app = express();
app.use(express.json());

// correlation id middleware
app.use((req, res, next) => {
  const correlationId = req.header("X-Correlation-ID") || uuidv4();
  req.correlationId = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);
  next();
});

// log every request
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
    const labels = { method: req.method, route: req.path, status: res.statusCode, service: 'payment-service' };
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

// routes
app.use('/api/payments', router);

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  logger.info({
    message: "Payment service started",
    port: PORT
  });
});
