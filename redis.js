const Redis = require("ioredis");
require("dotenv").config();

/**
 * Redis connection configuration
 * Handles connection, events, and error cases
 */
const redis = new Redis({
  port: process.env.REDIS_PORT,
  host: process.env.REDIS_HOST,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  reconnectOnError: function(err) {
    console.log('Redis reconnect on error:', err);
    return true;
  }
});

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('close', () => {
  console.log('Redis connection closed');
});

/**
 * Clears all data from Redis
 * Used for fresh crawl sessions
 * @async
 * @throws {Error} If Redis flush fails
 */
const clearCache = async () => {
  try {
    await redis.flushall();
    console.log('Redis cache cleared');
  } catch (err) {
    console.error('Error clearing Redis:', err);
  }
};

module.exports = { redis, clearCache };
