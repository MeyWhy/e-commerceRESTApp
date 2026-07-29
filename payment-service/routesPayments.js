const express = require('express');
const router = express.Router();
const db = require('./db'); 
const axios = require('axios');
const logger = require('./logger.js');
const { authenticate, authorize, authorizeOwnerOrAdmin, authorizeOwnerOrAdminOrService } = require('./middleware/auth');
const metrics = require('./metrics');

// Helper: récupère les infos d'une commande depuis order-service
const getOrderInfo = async (orderId, token) => {
  try {
    const response = await axios.get(
      `http://order-service:3001/api/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info(`Order ${orderId} fetched from order-service`, { service: 'payment-service' });
    return response.data;
  } catch (err) {
    logger.error(`Failed to fetch order ${orderId}`, { service: 'payment-service', error: err.message });
    if (err.response?.status === 404) throw new Error('Order not found');
    throw new Error('Failed to fetch order info');
  }
};

// GET all payments | ADMIN ONLY
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM payments');
    logger.info(`Fetched all payments`, { service: 'payment-service', action: 'GET_ALL_PAYMENTS', count: rows.length });
    res.json(rows);
  } catch (err) {
    logger.error('Failed to fetch all payments', { service: 'payment-service', error: err.message });
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET payment by id | ADMIN OR OWNER
const getPaymentOwnerId = async (req) => {
  const [rows] = await db.query('SELECT user_id FROM payments WHERE id = ?', [req.params.id]);
  if (rows.length === 0) throw new Error('Payment not found');
  return Number(rows[0].user_id);
};

router.get('/:id', authenticate, authorizeOwnerOrAdmin(getPaymentOwnerId), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    logger.info(`Payment ${req.params.id} fetched`, { service: 'payment-service', action: 'GET_PAYMENT', requestedBy: req.user.userId });
    res.json(rows[0]);
  } catch (err) {
    logger.error(`Failed to fetch payment ${req.params.id}`, { service: 'payment-service', error: err.message });
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// GET payment by order id | ADMIN OR OWNER OR SERVICE
router.get('/order/:id', authenticate, authorizeOwnerOrAdminOrService(async (req) => {
  const [rows] = await db.query('SELECT user_id FROM payments WHERE order_id = ?', [req.params.id]);
  if (!rows.length) throw new Error('Payment not found for this order');
  return Number(rows[0].user_id);
}), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM payments WHERE order_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Payment not found' });
    logger.info(`Payment for order ${req.params.id} fetched`, { service: 'payment-service', action: 'GET_PAYMENT_BY_ORDER', requestedBy: req.user.userId });
    res.json(rows[0]);
  } catch (err) {
    logger.error(`Failed to fetch payment for order ${req.params.id}`, { service: 'payment-service', error: err.message });
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// POST create payment | SIMPLIFIED VERSION
router.post('/', authenticate, async (req, res) => {
  try {
    const { orderId, amount, method } = req.body;
    const token = req.headers['authorization'].split(' ')[1];

    logger.info("Payment request received", { 
      service: 'payment-service',
      orderId, 
      amount, 
      method,
      correlationId: req.correlationId 
    });

    // Fetch order info
    const order = await getOrderInfo(orderId, token);
    const userId = order.userId ?? order.user_id;

    if (!userId) {
      logger.error('Order has no userId', { service: 'payment-service', order, orderId });
      return res.status(400).json({ error: 'Order has no userId' });
    }

    // Check authorization (user can only pay their own orders, unless admin)
    if (req.user.role !== 'admin' && req.user.userId !== Number(userId)) {
      logger.warn('Unauthorized payment attempt', { 
        service: 'payment-service',
        requestedBy: req.user.userId, 
        orderOwner: userId 
      });
      return res.status(403).json({ error: 'Not authorized to pay this order' });
    }

    const status = 'SUCCESS';
    
    logger.info("Inserting payment into database", { 
      service: 'payment-service',
      orderId, 
      userId, 
      amount, 
      method, 
      status 
    });

    const [result] = await db.query(
      'INSERT INTO payments (order_id, user_id, amount, method, status) VALUES (?, ?, ?, ?, ?)',
      [orderId, userId, amount, method, status]
    );

    logger.info('Payment inserted successfully', { 
      service: 'payment-service',
      paymentId: result.insertId,
      orderId,
      userId 
    });

    // Retrieve newly created payment
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE id = ?',
      [result.insertId]
    );

    logger.info(`Payment ${result.insertId} created successfully`, {
      service: 'payment-service',
      action: 'CREATE_PAYMENT',
      paymentId: result.insertId,
      orderId: orderId,
      userId: userId,
      createdBy: req.user.userId,
      correlationId: req.correlationId
    });

    metrics.paymentsCreated.inc();
    metrics.totalRevenue.inc(amount);
    
    res.status(201).json(rows[0]);
    
  } catch (err) {
    // Enhanced error logging
    logger.error('Failed to process payment', {
      service: 'payment-service',
      action: 'CREATE_PAYMENT_ERROR',
      error: err.message,
      errorCode: err.code,
      errorErrno: err.errno,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage,
      stack: err.stack,
      body: req.body,
      correlationId: req.correlationId
    });
    
    metrics.paymentFailures.inc();
    res.status(500).json({ error: 'Failed to process payment', details: err.message });
  }
});

// Health check with DB test
router.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', service: 'payment-service', database: 'connected' });
  } catch (err) {
    logger.error('Health check failed', { service: 'payment-service', error: err.message });
    res.status(503).json({ 
      status: 'unhealthy', 
      service: 'payment-service',
      database: 'disconnected',
      error: err.message 
    });
  }
});

module.exports = router;