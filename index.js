const { Worker } = require("bullmq");
const {
  crawlQueue,
  startMetricsCollection,
  stopMetricsCollection,
  queueEvents,
} = require("./queue");
const { redis, clearCache } = require("./redis");
const { crawlWebsite } = require("./crawler");
const fs = require("fs").promises;
require("dotenv").config();

// Number of worker threads to create
const CONCURRENT_WORKERS = parseInt(process.env.CONCURRENT_WORKERS) || 8;

// Get domains from environment variables
let domains = [];
try {
  domains = JSON.parse(process.env.DOMAINS || "[]");
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error("DOMAINS must be a non-empty array of URLs");
  }
  // Validate URLs
  domains.forEach((domain) => {
    try {
      new URL(domain);
    } catch (e) {
      throw new Error(`Invalid domain URL: ${domain}`);
    }
  });
} catch (error) {
  console.error("Error parsing DOMAINS from environment:", error.message);
  process.exit(1);
}

/**
 * Main execution function
 * Initializes workers, processes domains, and manages cleanup
 */
(async () => {
  await clearCache();
  let completedJobs = 0;
  const processedDomains = new Set(); // Track unique processed domains

  // Create workers
  const workers = Array.from(
    { length: CONCURRENT_WORKERS },
    (_, i) =>
      new Worker(
        "crawlQueue",
        async (job) => {
          console.log(`Worker ${i + 1} processing: ${job.data.url}`);
          const urls = await crawlWebsite(job.data.url);
          // Store domain name and URLs in Redis
          const name = job.data.url.match(/https?:\/\/(www\.)?([^./]+)\./)[2];
          await redis.hset(`domain:${job.data.url}`, {
            name: name,
            urls: JSON.stringify(urls), // Store URLs as stringified array
          });
          return urls;
        },
        {
          connection: redis,
          concurrency: 1,
          limiter: { max: 1, duration: 2000 },
          settings: {
            lockDuration: 60000,
            stalledInterval: 60000,
          },
        }
      )
  );

  try {
    // Start metrics collection after Redis is initialized
    startMetricsCollection();

    const jobPromise = new Promise((resolve, reject) => {
      workers.forEach((worker, i) => {
        worker.on("completed", async (job) => {
          completedJobs++;
          processedDomains.add(job.data.url);
          const progress = ((completedJobs / domains.length) * 100).toFixed(2);
          console.log(
            `Worker ${i + 1} completed job for ${
              job.data.url
            } (Progress: ${progress}%)`
          );

          // Check if we've processed all unique domains
          if (processedDomains.size === domains.length) {
            console.log("All domains processed successfully");
            const urlsData = {};
            for (const domain of domains) {
              const data = await redis.hgetall(`domain:${domain}`);
              if (data) {
                urlsData[domain] = {
                  name: data.name,
                  urls: JSON.parse(data.urls || "[]"),
                };
              } else {
                console.log(`Warning: No data found for ${domain}`);
              }
            }
            await fs.writeFile(
              "crawled_urls.json",
              JSON.stringify(urlsData, null, 2)
            );
            console.log("Created crawled_urls.json with Redis data");
            resolve();
          }
        });

        worker.on("failed", (job, err) => {
          completedJobs++;
          processedDomains.add(job.data.url);
          console.error(`Worker ${i + 1} failed job for ${job.data.url}:`, err);

          // Even if job failed, check if we've processed all domains
          if (processedDomains.size === domains.length) {
            console.log("All domains processed (some may have failed)");
            resolve();
          }
        });
      });
    });

    // Add all jobs to queue at once
    await Promise.all(
      domains.map((domain) =>
        crawlQueue.add(
          "crawl",
          { url: domain },
          {
            jobId: domain,
            removeOnComplete: true,
            removeOnFail: 10,
            attempts: 3,
          }
        )
      )
    );
    console.log(`Added ${domains.length} jobs to queue`);

    await jobPromise;
    console.log("All processing complete");
  } catch (error) {
    console.error("Crawl failed:", error.message);
  } finally {
    console.log("Starting cleanup...");

    // 1. Stop accepting new jobs
    await crawlQueue.pause();

    // 2. Stop metrics collection and wait a moment for any in-flight metrics to complete
    await stopMetricsCollection();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 3. Close workers
    console.log("Closing workers...");
    await Promise.all(workers.map((worker) => worker.close()));

    // 4. Close queue events
    console.log("Closing queue events...");
    await queueEvents.close();

    // 5. Close queue
    console.log("Closing queue...");
    await crawlQueue.close();

    // 6. Finally close Redis
    console.log("Closing Redis connection...");
    await redis.quit();

    console.log("Cleanup complete");
  }
})().catch(console.error);
