const { Queue, QueueEvents } = require("bullmq");
const { redis } = require("./redis");

// Create a new queue
const crawlQueue = new Queue("crawlQueue", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// Add queue monitoring
const queueEvents = new QueueEvents("crawlQueue", {
  connection: redis,
});

// Monitor queue events
queueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed!`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed! Reason: ${failedReason}`);
});

queueEvents.on("active", ({ jobId, prev }) => {
  console.log(`Job ${jobId} is now active; Previous status was ${prev}`);
});

queueEvents.on("stalled", ({ jobId }) => {
  console.warn(`Job ${jobId} has stalled`);
});

let metricsInterval;

/**
 * Queue metrics tracking
 * Collects and returns current queue statistics
 * @async
 * @returns {Promise<Object|null>} Queue metrics or null if unavailable
 */
const getQueueMetrics = async () => {
  try {
    if (redis.status !== "ready") {
      console.log("Redis connection not ready, skipping metrics collection");
      return null;
    }

    const [waiting, active, completed, failed] = await Promise.all([
      crawlQueue.getWaitingCount(),
      crawlQueue.getActiveCount(),
      crawlQueue.getCompletedCount(),
      crawlQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      timestamp: Date.now(),
    };
  } catch (error) {
    if (!error.message.includes("Connection is closed")) {
      console.error("Error collecting queue metrics:", error);
    }
    return null;
  }
};

/**
 * Starts periodic collection of queue metrics
 * Runs every 5 seconds and logs metrics to console
 */
const startMetricsCollection = () => {
  metricsInterval = setInterval(async () => {
    const metrics = await getQueueMetrics();
    if (metrics) {
      console.log("Queue Metrics:", metrics);
    }
  }, 5000);
};

/**
 * Safely stops metrics collection
 * Ensures all in-flight metric operations complete
 * @async
 */
const stopMetricsCollection = async () => {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    // Give time for any in-flight metrics collection to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("Metrics collection stopped");
  }
};

// Remove the process.on handlers from here since we'll handle shutdown in index.js
module.exports = {
  crawlQueue,
  startMetricsCollection,
  stopMetricsCollection,
  queueEvents,
};
