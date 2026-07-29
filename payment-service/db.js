const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'paymentuser',
  password: process.env.DB_PASSWORD || 'paymentpass',
  database: process.env.DB_NAME || 'paymentdb',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = db;
