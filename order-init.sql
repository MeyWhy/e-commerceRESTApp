CREATE DATABASE IF NOT EXISTS orderdb;
USE orderdb;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,        -- fk to customer TODO to make it real
  item VARCHAR(255) NOT NULL,      -- product name (matches inventory) TODO to make it real
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('PENDING', 'CONFIRMED','SHIPPED', 'CANCELLED') DEFAULT 'PENDING',
  tracking_id VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outbox (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  order_id INT DEFAULT NULL,
  payload JSON NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Sample data (assuming customer IDs exist)
-- INSERT INTO orders (customer_id, item, quantity) VALUES (1, 'Prod1', 2);
-- INSERT INTO orders (customer_id, item, quantity) VALUES (2, 'Phone', 1);
-- INSERT INTO orders (customer_id, item, quantity) VALUES (1, 'PC', 3);
