const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'shipping-db',
  user: process.env.DB_USER || 'shippinguser',
  password: process.env.DB_PASSWORD || 'shippingpass',
  database: process.env.DB_NAME || 'shippingdb',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = db;
