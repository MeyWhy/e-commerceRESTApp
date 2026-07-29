const amqp = require("amqplib");

async function startConsumer() {
  try {
    const connection = await amqp.connect("amqp://rabbitmq");
    const channel = await connection.createChannel();
    await channel.assertQueue("order_notifications", { durable: true });

    console.log("Notification service subscribed to RabbitMQ...");

    channel.consume("order_notifications", msg => {
      if (msg !== null) {
        const data = JSON.parse(msg.content.toString());

        console.log(`RabbitMQ Notification → User ${data.userId}, Order ${data.orderId}`);
        console.log("Message:", data.text);

        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error("RabbitMQ consumer error:", err.message);
    setTimeout(startConsumer, 3000);
  }
}

module.exports = startConsumer;
