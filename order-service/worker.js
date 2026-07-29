require("dotenv").config();
const db = require("./db");
const axios = require("axios");
const amqp = require("amqplib");
const CircuitBreaker = require("opossum");
const logger = require("./logger");
const metrics = require('./metrics.js');
let channel;

const serviceTag = { service: "order-service-worker" };


const paymentApi = axios.create({
  baseURL: "http://payment-service:3004/api/",
  timeout: 5000
});

const shippingApi = axios.create({
  baseURL: "http://shipping-service:3005/api/",
  timeout: 5000
});


// Circuit breaker options
const breakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  errorFilter: (err) => {
    if (err.response?.status === 404) {
      logger.info("404 ignored by circuit breaker (expected in manual flow)", serviceTag);
      return false;
    }
    return true;
  }
};
//Payment Circuit Breaker 
const paymentCall = async (orderId) => 
  { try {
    logger.info(`Calling payment-service for order ${orderId}`, serviceTag);
    const response = await paymentApi.get(`/payments/order/${orderId}`, { headers: { Authorization: `Bearer ${process.env.SERVICE_TOKEN}` }
     }); 
    logger.info(`Payment response received`, { ...serviceTag, data: response.data }); 
    return response.data; } 
    catch (err) { logger.error("Payment call error", { ...serviceTag, message: err.message, url: err.config?.url, status: err.response?.status, response: err.response?.data }); throw err; } };
// Payment Circuit Breaker
const paymentBreaker = new CircuitBreaker(paymentCall, breakerOptions);

paymentBreaker.fallback(orderId => {
  logger.warn(`Payment service unavailable for order ${orderId}`, serviceTag);
  metrics.rejectedRequests.inc();
  return null;
});

paymentBreaker.on('open', () => {
  logger.error("Payment Circuit breaker OPEN", serviceTag);
  metrics.circuitBreakerState.set(1); // open
  metrics.circuitBreakerOpen.inc();
});
paymentBreaker.on('halfOpen', () => {
  logger.warn("Payment Circuit breaker HALF-OPEN", serviceTag);
  metrics.circuitBreakerState.set(2);
  metrics.circuitBreakerHalfOpen.inc();
});
paymentBreaker.on('close', () => {
  logger.info("Payment Circuit breaker CLOSED", serviceTag);
  metrics.circuitBreakerState.set(0);
  metrics.circuitBreakerClose.inc();
});

// Wrap with retry counter
async function retryRequest(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) metrics.retryAttempts.inc();
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;

      if (err.code === 'ECONNABORTED') metrics.timeoutErrors.inc(); // axios timeout
      const jitter = Math.random() * 0.3;
      const wait = delay * Math.pow(2, i) * (1 + jitter);
      logger.warn(`Retrying in ${Math.round(wait)}ms...`, serviceTag);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// Shipping Circuit Breaker
const shippingCall = async (payload) => {
  const response = await shippingApi.post("/shipping", {
    orderId: payload.orderId,
    address: payload.userAdd,
    userId: payload.userId
  }, {
    headers: { "x-internal-key": process.env.INTERNAL_SERVICE_KEY }
  });

  return response.data;
};

const shippingBreaker = new CircuitBreaker(shippingCall, breakerOptions);
shippingBreaker.fallback(payload => {
  logger.warn(`Shipping service unavailable for order ${payload.orderId}`, serviceTag);
  metrics.ShippingRejectedRequests.inc();
  return null;
});
shippingBreaker.on('open', () => {
  logger.error("Shipping Circuit breaker OPEN", serviceTag)
  metrics.circuitBreakerState.set(1); // open
  metrics.circuitBreakerOpen.inc();
});
shippingBreaker.on('halfOpen', () => {
  logger.warn("Shipping Circuit breaker HALF-OPEN", serviceTag)
  metrics.circuitBreakerState.set(2);
  metrics.circuitBreakerHalfOpen.inc();
});
shippingBreaker.on('close', () => {
  logger.info("Shipping Circuit breaker CLOSED", serviceTag)
  metrics.circuitBreakerState.set(0);
  metrics.circuitBreakerClose.inc();
});

// Connect to RabbitMQ
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect("amqp://rabbitmq");
    channel = await connection.createChannel();
    await channel.assertQueue("order_notifications", { durable: true });
    logger.info("Connected to RabbitMQ", serviceTag);
  } catch (err) {
    logger.error("RabbitMQ connection failed", { ...serviceTag, error: err.message });
    setTimeout(connectRabbitMQ, 3000);
  }
}

// Connect to DB with retry
async function connectDBWithRetry() {
  let connected = false;
  while (!connected) {
    try {
      await db.query("SELECT 1");
      connected = true;
      logger.info("Connected to DB", serviceTag);
    } catch {
      logger.warn("DB not ready, retrying in 3s...", serviceTag);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Process outbox events
async function processOutbox() {
  try {
    const [events] = await db.query(
      "SELECT * FROM outbox WHERE processed = FALSE ORDER BY created_at ASC LIMIT 10"
    );

    for (const event of events) {
      let payload;
      try {
        payload = typeof event.payload === "string"
          ? JSON.parse(event.payload)
          : event.payload;
      } catch (err) {
        logger.error("Failed to parse payload", {
          ...serviceTag,
          payload: event.payload,
          error: err.message
        });
        continue;
      }

      logger.info("Processing event", { ...serviceTag, type: event.event_type, payload });

      if (payload.status === "CANCELLED") {
        logger.warn(`Order ${payload.orderId} cancelled. Skipping...`, serviceTag);
        await db.query("UPDATE outbox SET processed = TRUE WHERE id = ?", [event.id]);
        continue;
      }

      if (event.event_type === "ORDER_CREATED") {

        // 1. Payment check
        let paymentRes;
        try {
          paymentRes = await retryRequest(() => paymentBreaker.fire(payload.orderId));

          if (!paymentRes) {
            logger.warn(`Payment unavailable for order ${payload.orderId}, retry later`, serviceTag);
            continue;
          }

          if (paymentRes.status !== "SUCCESS") {
            logger.info(`Payment '${paymentRes.status}' for order ${payload.orderId}, waiting...`, serviceTag);
            continue;
          }

          logger.info(`Payment OK for order ${payload.orderId}`, serviceTag);
        } catch (err) {
          if (err.response?.status === 404) {
            logger.info(`Payment not created yet for ${payload.orderId}`, serviceTag);
            continue;
          }

          logger.error("Payment check failed", { ...serviceTag, orderId: payload.orderId, error: err.message });
          continue;
        }

        // 2. Shipping creation
        let shippingRes;
        try {
          shippingRes = await retryRequest(() => shippingBreaker.fire(payload));

          if (!shippingRes) {
            logger.warn(`Shipping unavailable for ${payload.orderId}`, serviceTag);
            continue;
          }

          if (!shippingRes.tracking_id) {
            logger.warn(`Shipping created but no tracking_id for ${payload.orderId}`, serviceTag);
            continue;
          }

          logger.info(`Shipping OK: ${shippingRes.tracking_id}`, serviceTag);
        } catch (err) {
          logger.error("Shipping creation failed", { ...serviceTag, orderId: payload.orderId, error: err.message });
          continue;
        }

        // 3. Update order status
        try {
          await axios.patch(
            `http://order-service:3001/api/orders/${payload.orderId}`,
            {
              status: "SHIPPED",
              tracking_id: shippingRes.tracking_id
            },
            {
              headers: { Authorization: `Bearer ${process.env.SERVICE_TOKEN}` }
            }
          );

          logger.info(`Order ${payload.orderId} updated to SHIPPED`, serviceTag);
        } catch (err) {
          logger.error("Order status update failed", { ...serviceTag, orderId: payload.orderId, error: err.message });
          continue;
        }

        // 4. Send notification to RabbitMQ
        try {
          const msg = {
            orderId: payload.orderId,
            userId: payload.userId,
            text: `Your order #${payload.orderId} has been shipped. Tracking: ${shippingRes.tracking_id}`
          };
          channel.sendToQueue("order_notifications", Buffer.from(JSON.stringify(msg)), { persistent: true });
          logger.info("Notification published to RabbitMQ", serviceTag);
        } catch (err) {
          logger.error("Failed to publish notification", { ...serviceTag, error: err.message });
        }

        // 5. Mark outbox event processed
        await db.query("UPDATE outbox SET processed = TRUE WHERE id = ?", [event.id]);
        logger.info(`Event ${event.id} processed`, serviceTag);
      }
    }
  } catch (err) {
    logger.error("Outbox worker error", { ...serviceTag, error: err.message });
  }
}

// Start worker
(async () => {
  await connectDBWithRetry();
  await connectRabbitMQ();
  logger.info("Order worker started", serviceTag);
  setInterval(processOutbox, 2000);
})();
