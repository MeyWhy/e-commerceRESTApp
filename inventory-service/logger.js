const pino = require("pino");

const streams = [
  { stream: process.stdout }
];

if (process.env.LOGSTASH_HOST) {
  try {
    const transport = pino.transport({
      target: "pino-socket",
      options: {
        address: process.env.LOGSTASH_HOST,
        port: Number(process.env.LOGSTASH_PORT || 5000),
        mode: "tcp",
        reconnect: true
      }
    });

    // 🔥 VERY IMPORTANT: swallow transport errors
    transport.on("error", (err) => {
      console.error("⚠️ Logstash transport error:", err.message);
    });

    streams.push({
      level: process.env.LOG_LEVEL || "info",
      stream: transport
    });
  } catch (err) {
    console.error("⚠️ Failed to init logstash transport:", err.message);
  }
}

const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: {
      service: process.env.SERVICE_NAME || "unknown-service"
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label.toUpperCase() };
      }
    }
  },
  pino.multistream(streams, { dedupe: true })
);

module.exports = logger;
