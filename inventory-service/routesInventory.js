const express = require('express');
const router = express.Router();
const db = require('./db');
const logger = require('./logger.js');
const { authenticate, authorizeAdmin } = require('./middleware/auth');
const metrics = require('./metrics');

// Get all products | anyone can view
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products');
    logger.info(`Fetched all products`, {
      service: 'inventory-service',
      action: 'GET_ALL_PRODUCTS',
      count: rows.length
    });
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching all products', {
      service: 'inventory-service',
      action: 'GET_ALL_PRODUCTS',
      error: err.message
    });
    res.status(500).json({ error: 'Database error fetching products' });
  }
});

// Get a specific product
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      logger.warn(`Product not found`, {
        service: 'inventory-service',
        action: 'GET_PRODUCT',
        productId: req.params.id
      });
      return res.status(404).json({ error: 'Product not found' });
    }
    logger.info(`Product fetched`, {
      service: 'inventory-service',
      action: 'GET_PRODUCT',
      productId: req.params.id
    });
    res.json(rows[0]);
  } catch (err) {
    logger.error('Error fetching product', {
      service: 'inventory-service',
      action: 'GET_PRODUCT',
      productId: req.params.id,
      error: err.message
    });
    res.status(500).json({ error: 'Database error fetching product' });
  }
});

// Validate stock (called by order service)
router.get('/validate/:item', async (req, res) => {
  const { item } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE name = ?', [item]);
    if (rows.length === 0) {
      logger.warn(`Product not found for validation`, {
        service: 'inventory-service',
        action: 'VALIDATE_PRODUCT',
        item
      });
      return res.status(404).json({ valid: false, message: 'Product not found' });
    }
    const product = rows[0];
    logger.info(`Product validated successfully`, {
      service: 'inventory-service',
      action: 'VALIDATE_PRODUCT',
      item
    });
    res.json({ valid: true, quantity: product.quantity, price: product.price, product });
  } catch (err) {
    logger.error('Error validating product', {
      service: 'inventory-service',
      action: 'VALIDATE_PRODUCT',
      item,
      error: err.message
    });
    res.status(500).json({ error: 'Error validating product stock' });
  }
});

// Create new product | ADMIN only
router.post('/', authenticate, authorizeAdmin, async (req, res) => {
  const { name, quantity, price } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO products (name, quantity, price) VALUES (?, ?, ?)',
      [name, quantity || 0, price || 0.0]
    );
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    logger.info(`Product created`, {
      service: 'inventory-service',
      action: 'CREATE_PRODUCT',
      productId: result.insertId
    });
    metrics.productsCreated.inc();
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('Error creating product', {
      service: 'inventory-service',
      action: 'CREATE_PRODUCT',
      error: err.message
    });
    res.status(500).json({ error: 'Database error creating product' });
  }
});

// Update product quantity or price | ADMIN only
router.patch('/:id', authenticate, authorizeAdmin, async (req, res) => {
  const { quantity, price } = req.body;
  const updates = [];
  const values = [];

  if (quantity !== undefined) {
    updates.push('quantity = ?');
    values.push(quantity);
  }

  if (price !== undefined) {
    updates.push('price = ?');
    values.push(price);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  values.push(req.params.id);

  try {
    const [result] = await db.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      logger.warn('Product not found for update', {
        service: 'inventory-service',
        action: 'UPDATE_PRODUCT',
        productId: req.params.id
      });
      return res.status(404).json({ error: 'Product not found' });
    }
    logger.info('Product updated successfully', {
      service: 'inventory-service',
      action: 'UPDATE_PRODUCT',
      productId: req.params.id
    });
    metrics.productsUpdated.inc();

    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    logger.error('Database update failed', {
      service: 'inventory-service',
      action: 'UPDATE_PRODUCT',
      productId: req.params.id,
      error: err.message
    });
    res.status(500).json({ error: 'Database update failed', details: err.message });
  }
});

// Delete product | ADMIN only
router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      logger.warn('Product not found for deletion', {
        service: 'inventory-service',
        action: 'DELETE_PRODUCT',
        productId: req.params.id
      });
      return res.status(404).json({ error: 'Product not found' });
    }
    logger.info('Product deleted successfully', {
      service: 'inventory-service',
      action: 'DELETE_PRODUCT',
      productId: req.params.id
    });
    metrics.productsDeleted.inc();

    res.json({ message: 'Product deleted' });
  } catch (err) {
    logger.error('Error deleting product', {
      service: 'inventory-service',
      action: 'DELETE_PRODUCT',
      productId: req.params.id,
      error: err.message
    });
    res.status(500).json({ error: 'Database error deleting product' });
  }
});

// Get only available products (quantity > 0)
router.get('/available/stock', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE quantity > 0');
    logger.info(`Fetched available products`, {
      service: 'inventory-service',
      action: 'GET_AVAILABLE_PRODUCTS',
      count: rows.length
    });
    metrics.stockValidated.inc();

    res.json(rows);
  } catch (err) {
    logger.error('Error fetching available products', {
      service: 'inventory-service',
      action: 'GET_AVAILABLE_PRODUCTS',
      error: err.message
    });
    metrics.inventoryLowStockAlerts.inc();
    res.status(500).json({ error: 'Database error fetching available products' });
  }
});

module.exports = router;
