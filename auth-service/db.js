const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const db =  mysql.createPool({
  host: process.env.DB_HOST || 'auth-db',
  user: process.env.DB_USER || 'authuser',
  password: process.env.DB_PASS || 'authpass',
  database: process.env.DB_NAME || 'usersdb'
});

module.exports=db;
