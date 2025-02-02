const { Worker } = require('bullmq');
const { redis } = require('../redis');
const { crawlWebsite } = require('../crawler');

class WorkerPool {
  constructor(queue, workerCount, workerOptions) {
    this.queue = queue;
    this.workerCount = workerCount;
    this.workerOptions = workerOptions;
    this.workers = [];
  }

  async start() {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(
        this.queue,
        async (job) => {
          console.log(`Worker ${i + 1} processing: ${job.data.url}`);
          try {
            return await crawlWebsite(job.data.url);
          } catch (error) {
            console.error(`Error in worker ${i + 1} for URL ${job.data.url}:`, error.message);
            throw error;
          }
        },
        {
          connection: redis,
          ...this.workerOptions,
        }
      );
      this.workers.push(worker);
    }
  }

  async stop() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}

module.exports = WorkerPool;
