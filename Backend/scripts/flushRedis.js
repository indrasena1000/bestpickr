require("dotenv").config();
const { createClient } = require("redis");
const client = createClient({ url: process.env.REDIS_URL });
client
  .connect()
  .then(async () => {
    const keys = await client.keys("bestpickr:*");
    if (!keys.length) {
      console.log("No bestpickr:* keys found — Redis already clean");
      await client.disconnect();
      return;
    }
    await client.del(keys);
    console.log("Deleted", keys.length, "bestpickr:* keys");
    await client.disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
