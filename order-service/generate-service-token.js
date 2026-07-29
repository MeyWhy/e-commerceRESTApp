// generate-service-token.js
const jwt = require("jsonwebtoken");

// Payload identifies the service
const payload = {
  service: "order-worker", // name of your worker
  role: "service"
};

// Use the same secret as your other services
const secret = process.env.JWT_SECRET || "test";

// Token expires in 30 days (adjust if you want)
const token = jwt.sign(payload, secret, { expiresIn: "30d" });

console.log("SERVICE_TOKEN=", token);
