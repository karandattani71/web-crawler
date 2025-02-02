const { Worker } = require('bullmq');
const { redis } = require('../redis');
const { crawlWebsite } = require('../crawler');
const { StaticPool } = require('node-worker-threads-pool');

class WorkerPool {
  constructor(size) {
    this.pool = new StaticPool({
      size,
      task: './crawler.js',
      workerData: {
        maxRetries: 3,
        timeout: 30000
      }
    });
    
    this.metrics = {
      activeWorkers: 0,
      completedJobs: 0,
      failedJobs: 0
    };
  }

  async execute(url) {
    this.metrics.activeWorkers++;
    try {
      const result = await this.pool.exec({url});
      this.metrics.completedJobs++;
      return result;
    } catch (error) {
      this.metrics.failedJobs++;
      throw error;
    } finally {
      this.metrics.activeWorkers--;
    }
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
