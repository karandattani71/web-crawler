const { Worker } = require("bullmq");
const { crawlQueue } = require("./queue");
const { redis, clearCache } = require("./redis");
const { crawlWebsite } = require("./crawler");
const fs = require("fs").promises;
require("dotenv").config();

const CONCURRENT_WORKERS = parseInt(process.env.CONCURRENT_WORKERS) || 10;
const domains = [
  "https://www.amazon.com",
  "https://www.flipkart.com",
  "https://www.ebay.com",
  "https://www.alibaba.com",
  "https://www.bestbuy.com",
  "https://www.target.com",
  "https://www.myntra.com",
  "https://www.snapdeal.com",
  "https://www.aliexpress.com",
  "https://www.newegg.com",
  "https://www.jd.com",
  "https://www.rakuten.com",
  "https://www.zalando.com",
  "https://www.asos.com",
  "https://www.sephora.com",
  "https://www.etsy.com",
  "https://www.wayfair.com",
  "https://www.sears.com",
  "https://www.lazada.com",
  "https://www.tmall.com",
  "https://www.shopify.com",
  "https://www.shopee.com",
  "https://www.bhphotovideo.com",
  "https://www.overstock.com",
  "https://www.carrefour.com",
  "https://www.costco.com",
  "https://www.nordstrom.com",
  "https://www.hm.com",
  "https://www.apple.com",
  "https://www.toysrus.com",
  "https://www.adidas.com",
  "https://www.nike.com",
  "https://www.kohls.com",
  "https://www.jcrew.com",
  "https://www.anthropologie.com",
  "https://www.urbanoutfitters.com",
  "https://www.saksfifthavenue.com",
  "https://www.boohoo.com",
  "https://www.forever21.com",
  "https://www.lululemon.com",
  "https://www.gap.com",
  "https://www.homedepot.com",
  "https://www.ikea.com",
  "https://www.acehardware.com",
  "https://www.dillards.com",
  "https://www.petco.com",
  "https://www.wayfair.com",
  "https://www.kroger.com",
  "https://www.samsclub.com",
  "https://www.walmart.com",
];

(async () => {
  await clearCache();
  let completedJobs = 0;

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
            lockDuration: 30000,
            stalledInterval: 30000,
          },
        }
      )
  );

  try {
    const jobPromise = new Promise((resolve, reject) => {
      const TIMEOUT = 60000; // 1 minute timeout per domain
      const totalTimeout = domains.length * TIMEOUT;

      workers.forEach((worker, i) => {
        worker.on("completed", async (job) => {
          completedJobs++;
          const progress = ((completedJobs / domains.length) * 100).toFixed(2);
          console.log(
            `Worker ${i + 1} completed job for ${
              job.data.url
            } (Progress: ${progress}%)`
          );

          if (completedJobs === domains.length) {
            console.log("All jobs completed successfully");
            // Create JSON from Redis data
            const urlsData = {};
            for (const domain of domains) {
              const data = await redis.hgetall(`domain:${domain}`);
              if (data) {
                urlsData[domain] = {
                  name: data.name,
                  urls: JSON.parse(data.urls || "[]"), // Parse stored URLs back to array
                };
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
          console.error(`Worker ${i + 1} failed job for ${job.data.url}:`, err);
          if (completedJobs === domains.length) {
            resolve();
          }
        });
      });

      setTimeout(
        () => reject(new Error(`Timeout after ${totalTimeout / 1000}s`)),
        totalTimeout
      );
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
    // Cleanup
    await Promise.all(workers.map((worker) => worker.close()));
    await crawlQueue.close();
    await redis.quit();
  }
})().catch(console.error);
