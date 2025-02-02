const { Queue } = require("bullmq");
const { redis } = require("./redis");

const crawlQueue = new Queue("crawlQueue", { 
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});

module.exports = { crawlQueue };
