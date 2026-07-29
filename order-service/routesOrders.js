const express = require('express');
const router = express.Router();
const db = require('./db');
const axios = require('axios');
const logger = require('./logger.js');
const { authenticate, authorize, authorizeOwnerOrAdmin, authorizeOwnerOrAdminOrService } = require('./middleware/auth');
const metrics = require('./metrics');

const authApi = axios.create({
  baseURL: "http://auth-service:3007/api/auth",
  //timeout: 5000
});

// GET all orders | ADMIN ONLY
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders');
    logger.info('Fetched all orders', { service: 'order-service', count: rows.length });
    res.json(rows);
  } catch (err) {
    logger.error('Failed to fetch orders', { service: 'order-service', error: err.message });
    res.status(500).json({ error: 'Database error fetching orders' });
  }
});

// GET specific order | ADMIN OR OWNER
router.get('/:id', authenticate, authorizeOwnerOrAdmin(async (req) => {
  const [rows] = await db.query('SELECT user_id FROM orders WHERE id = ?', [req.params.id]);
  if (rows.length === 0) throw new Error('Order not found');
  return rows[0].user_id;
}), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    logger.info(`Fetched order ${req.params.id}`, { service: 'order-service', userId: req.user.userId });
    res.json(rows[0]);
  } catch (err) {
    logger.error('Failed to fetch order', { service: 'order-service', orderId: req.params.id, error: err.message });
    res.status(500).json({ error: 'Database error fetching order' });
  }
});

// CREATE new order
router.post('/', authenticate, authorizeOwnerOrAdmin(async (req) => {
  if (req.user.role === 'admin') return true;
  return req.body.userId ? Number(req.body.userId) : req.user.userId;
}), async (req, res) => {
  try {
    const { item, quantity, paymentMethod, userAdd, userId: bodyUserId } = req.body;
    const userId = req.user.role === 'admin' ? bodyUserId : req.user.userId;

    // Validate user via auth-service
    const authResponse = await authApi.get(`/validate/${Number(userId)}`);
    if (!authResponse.data.valid) return res.status(400).json({ error: 'Invalid user ID' });

    // Validate inventory
    const inventoryResponse = await axios.get(`http://inventory-service:3002/api/products/validate/${encodeURIComponent(item)}`);
    if (!inventoryResponse.data.valid || inventoryResponse.data.product.quantity < quantity) {
      return res.status(400).json({ error: 'Product not available in requested quantity' });
    }

    const product = inventoryResponse.data.product;
    
    const [insertResult] = await db.query(
      'INSERT INTO orders (item, quantity, user_id, status) VALUES (?, ?, ?, ?)',
      [item, quantity, userId, 'PENDING']
    );

    const orderId = insertResult.insertId;

    // Insert event in outbox
    const eventPayload = { orderId, userId, item, quantity, paymentMethod, userAdd, price: parseFloat(product.price) };
    await db.query('INSERT INTO outbox (event_type, payload, order_id) VALUES (?, ?, ?)',
      ['ORDER_CREATED', JSON.stringify(eventPayload), orderId]
    );

    logger.info(`Order ${orderId} created`, { service: 'order-service', userId });
    metrics.ordersCreated.inc();
    metrics.productsSold.inc({ product_name: item }, quantity);

    res.status(201).json({ message: 'Order created', orderId });
  } catch (err) {
    logger.error('Failed to create order', { service: 'order-service', error: err.message });
    metrics.ordersFailed.inc();
    res.status(500).json({ error: 'Order creation failed', details: err.message });
  }
});

// CANCEL order | ADMIN OR OWNER
router.delete('/:id', authenticate, authorizeOwnerOrAdmin(async (req) => {
  const [rows] = await db.query('SELECT user_id FROM orders WHERE id = ?', [req.params.id]);
  if (rows.length === 0) throw new Error('Order not found');
  return rows[0].user_id;
}), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found' });
    logger.info(`Order ${req.params.id} deleted`, { service: 'order-service', userId: req.user.userId });
    metrics.ordersDeleted.inc();
    res.json({ message: 'Order deleted' });
  } catch (err) {
    logger.error('Failed to delete order', { service: 'order-service', orderId: req.params.id, error: err.message });
    res.status(500).json({ error: 'Database error deleting order' });
  }
});

// UPDATE order quantity | ADMIN OR OWNER
router.put('/:id', authenticate, authorizeOwnerOrAdmin(async (req) => {
  const [rows] = await db.query('SELECT user_id FROM orders WHERE id = ?', [req.params.id]);
  if (rows.length === 0) throw new Error('Order not found');
  return rows[0].user_id;
}), async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity == null) return res.status(400).json({ error: 'Quantity is required' });

    const [result] = await db.query('UPDATE orders SET quantity = ? WHERE id = ?', [quantity, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found' });

    logger.info(`Order ${req.params.id} quantity updated`, { service: 'order-service', quantity });
    metrics.ordersUpdated.inc();
    res.json({ message: 'Order quantity updated' });
  } catch (err) {
    logger.error('Failed to update order', { service: 'order-service', orderId: req.params.id, error: err.message });
    res.status(500).json({ error: 'Database error updating order' });
  }
});

// UPDATE order status | ADMIN, OWNER or INTERNAL SERVICE
router.patch('/:id', authenticate, authorizeOwnerOrAdminOrService(async (req) => {
  const [rows] = await db.query('SELECT user_id FROM orders WHERE id = ?', [req.params.id]);
  return rows[0].user_id;
}), async (req, res) => {
  try {
    const { status, tracking_id } = req.body;
    await db.query('UPDATE orders SET status = ?, tracking_id = ? WHERE id = ?', [status, tracking_id, req.params.id]);
    logger.info(`Order ${req.params.id} status updated`, { service: 'order-service', status, tracking_id });
    metrics.ordersUpdated.inc();
    res.json({ message: 'Order updated' });
  } catch (err) {
    logger.error('Failed to update order status', { service: 'order-service', orderId: req.params.id, error: err.message });
    res.status(500).json({ error: 'Database error updating order status' });
  }
});

// GET total quantity
router.get('/total/quantity', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT SUM(quantity) AS totalQuantity FROM orders');
    res.json(rows[0]);
  } catch (err) {
    logger.error('Failed to calculate total quantity', { service: 'order-service', error: err.message });
    res.status(500).json({ error: 'Database error calculating total quantity' });
  }
});

module.exports = router;
