const Redis = require("ioredis");
require("dotenv").config();

const redis = new Redis({
  port: process.env.REDIS_PORT,
  host: process.env.REDIS_HOST,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const clearCache = async () => {
  try {
    await redis.flushall();
    console.log('Redis cache cleared');
  } catch (err) {
    console.error('Error clearing Redis:', err);
  }
};

module.exports = { redis, clearCache };
