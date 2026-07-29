CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  address VARCHAR(255),
  role ENUM('admin', 'customer') NOT NULL
);


 insert into users (name, username, password, email, address, role) values ('admin','admin', '$2a$12$vEPEjhfum4u4D11YnENTGOe.sybTTGwzUDr4uBxfVkp0Uv3XLB2S6','admin@admin.com', '342 Street', 'admin');
 insert into users (name, username, password,email, address, role) values ('testname', 'testuser', '$2a$12$dk0gXj21VXotP3siAkVjRucONFkNWB875QWlVGo/xeLMD16kqnLpO', 'user@email.com', '345 Rue', 'customer');
-- insert into users (username, password, role) values ('test', '$2b$12$xfapMMH5ALWUhwqWOQKliOmerJ0iPs5jSvqr9z0W3WMWBR9Mef0Q.', 'customer');
-- pwd : admin, , test