const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,      // removes pid, hostname
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    }
  }
});

module.exports = logger;
