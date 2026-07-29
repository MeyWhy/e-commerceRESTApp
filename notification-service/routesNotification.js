const express = require("express");
const router = express.Router();
const logger = require('./logger.js');
const metrics = require('./metrics');

// POST /notify
router.post("/notify", async (req, res) => {
  const { orderId, userId, message } = req.body;

  if (!orderId || !userId || !message) {
    logger.warn("Missing required fields for notification", {
      service: "notification-service",
      action: "SEND_NOTIFICATION",
      orderId,
      userId
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // TODO: intégrer un vrai service mail/SMS si nécessaire
    logger.info(`Sending notification to user ${userId} for order ${orderId}`, {
      service: "notification-service",
      action: "SEND_NOTIFICATION",
      orderId,
      userId,
      message
    });
    metrics.notificationsSent.inc();

    console.log(`Notification for customer ${userId}, order ${orderId}: ${message}`);

    res.status(200).json({ success: true, message: "Notification sent" });
  } catch (err) {
    logger.error("Error sending notification", {
      service: "notification-service",
      action: "SEND_NOTIFICATION",
      orderId,
      userId,
      error: err.message
    });
    res.status(500).json({ error: "Failed to send notification" });
  }
});

module.exports = router;
