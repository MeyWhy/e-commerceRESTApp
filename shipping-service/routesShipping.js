const express = require('express');
const router = express.Router();
const db = require('./db');
const axios = require('axios');
const logger = require('./logger.js');
const { authenticate, authorize, authorizeOwnerOrAdmin } = require('./middleware/auth');
const metrics = require('./metrics');

// simple option: static key
const internalAuth = (req, res, next) => {
  const key = req.headers['x-internal-key'];
  if (key !== process.env.INTERNAL_SERVICE_KEY) {
    logger.warn("Unauthorized internal access attempt", {
      service: "shipping-service",
      action: "INTERNAL_AUTH",
      correlationId: req.correlationId
    });
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Helper: récupère les infos d'une commande depuis order-service
const getOrderInfo = async (orderId, token) => {
  try {
    const response = await axios.get(
      `http://order-service:3001/api/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info("Order fetched for shipping", {
      service: "shipping-service",
      orderId,
      correlationId: token
    });
    return response.data;
  } catch (err) {
    logger.error("Failed to fetch order", {
      service: "shipping-service",
      action: "GET_ORDER",
      orderId,
      error: err.message
    });
    if (err.response?.status === 404) throw new Error('Order not found');
    throw new Error('Failed to fetch order info');
  }
};

// get all shipments | ADMIN ONLY
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM shipments');
    logger.info("Fetched all shipments", {
      service: "shipping-service",
      count: rows.length,
      correlationId: req.correlationId
    });
    res.json(rows);
  } catch (err) {
    logger.error("Error fetching shipments", {
      service: "shipping-service",
      error: err.message,
      correlationId: req.correlationId
    });
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

// Helper pour GET: récupère le user_id depuis shipments
const getShipmentOwnerId = async (req) => {
  const [rows] = await db.query(
    'SELECT user_id FROM shipments WHERE order_id = ?',
    [req.params.orderId]
  );
  if (rows.length === 0) {
    const error = new Error('Shipment not found');
    error.status = 404;
    throw error;
  }
  return Number(rows[0].user_id);
};

// get shipment by order Id | ADMIN OR OWNER
router.get(
  '/:orderId',
  authenticate,
  authorizeOwnerOrAdmin(getShipmentOwnerId),
  async (req, res) => {
    try {
      const [rows] = await db.query(
        'SELECT * FROM shipments WHERE order_id = ?',
        [req.params.orderId]
      );

      if (rows.length === 0) {
        logger.warn("Shipment not found", {
          service: "shipping-service",
          orderId: req.params.orderId,
          correlationId: req.correlationId
        });
        return res.status(404).json({ error: 'No shipment found for this order' });
      }

      logger.info("Shipment fetched", {
        service: "shipping-service",
        orderId: req.params.orderId,
        correlationId: req.correlationId
      });
      res.json(rows[0]);
    } catch (err) {
      logger.error("Error fetching shipment", {
        service: "shipping-service",
        orderId: req.params.orderId,
        error: err.message,
        correlationId: req.correlationId
      });
      res.status(err.status || 500).json({ error: err.message || 'Failed to fetch shipment' });
    }
  }
);

// create a new shipment (called after successful payment)
router.post("/", internalAuth, async (req, res) => { 
  try {
    const { orderId, address, userId } = req.body;
    if (!userId) {
      logger.warn("Missing userId for shipment creation", {
        service: "shipping-service",
        action: "CREATE_SHIPMENT",
        correlationId: req.correlationId
      });
      return res.status(400).json({ error: 'userId is required' });
    }

    const trackingId = `trk_${Math.random().toString(36).substring(7)}`;
    const status = 'SHIPPED';

    const [result] = await db.query(
      'INSERT INTO shipments (order_id, user_id, address, status, tracking_id) VALUES (?, ?, ?, ?, ?)',
      [orderId, userId, address, status, trackingId]
    );

    const [rows] = await db.query(
      'SELECT * FROM shipments WHERE id = ?',
      [result.insertId]
    );

    logger.info("Shipment created", {
      service: "shipping-service",
      shipmentId: result.insertId,
      correlationId: req.correlationId
    });
    metrics.shipmentsCreated.inc();

    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error("Error creating shipment", {
      service: "shipping-service",
      error: err.message,
      correlationId: req.correlationId
    });
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

// update shipping status | ADMIN ONLY
router.patch(
  '/:id',
  authenticate,
  authorize(['admin']),
  async (req, res) => {
    try {
      const { status } = req.body;
      const shipmentId = req.params.id;

      if (!shipmentId || shipmentId === 'null' || isNaN(Number(shipmentId))) {
        logger.warn("Invalid shipment ID", {
          service: "shipping-service",
          shipmentId,
          correlationId: req.correlationId
        });
        return res.status(400).json({ error: 'Invalid shipment ID' });
      }

      const [result] = await db.query(
        'UPDATE shipments SET status = ? WHERE id = ?',
        [status, shipmentId]
      );

      if (result.affectedRows === 0) {
        logger.warn("Shipment not found for update", {
          service: "shipping-service",
          shipmentId,
          correlationId: req.correlationId
        });
        return res.status(404).json({ error: 'Shipment not found' });
      }

      logger.info("Shipment status updated", {
        service: "shipping-service",
        shipmentId,
        status,
        correlationId: req.correlationId
      });

      res.json({ message: 'Shipping status updated' });
    } catch (err) {
      logger.error("Error updating shipment", {
        service: "shipping-service",
        error: err.message,
        correlationId: req.correlationId
      });
      res.status(500).json({ error: 'Failed to update shipment' });
    }
  }
);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'shipping-service' });
});

module.exports = router;
