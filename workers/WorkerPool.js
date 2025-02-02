const { Worker } = require('bullmq');
const { redis } = require('../redis');
const { crawlWebsite } = require('../crawler');  // Add this import

class WorkerPool {
  constructor(concurrency = 5) {
    this.workers = [];
    this.concurrency = concurrency;
  }

  start() {
    for (let i = 0; i < this.concurrency; i++) {
      const worker = new Worker(
        'crawlQueue',
        async (job) => {
          console.log(`Worker ${i + 1} processing: ${job.data.url}`);
          await crawlWebsite(job.data.url);
        },
        { 
          connection: redis,
          concurrency: 1,
          limiter: {
            max: 2,
            duration: 1000 // Rate limit: 2 requests per second per worker
          }
        }
      );

      worker.on('failed', (job, err) => {
        console.error(`Job ${job.id} failed:`, err);
        // Retry logic
        if (job.attemptsMade < 3) {
          return job.retry();
        }
      });

      this.workers.push(worker);
    }
  }

  async stop() {
    await Promise.all(this.workers.map(worker => worker.close()));
  }
}

module.exports = { WorkerPool };  // Export as an object
