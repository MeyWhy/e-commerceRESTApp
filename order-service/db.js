const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'order-db',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'orderuser',
  password: process.env.DB_PASSWORD || 'orderpass',
  database: process.env.DB_NAME || 'orderdb',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
