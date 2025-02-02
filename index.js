const { Worker } = require("bullmq");
const { crawlQueue } = require("./queue");
const { redis, clearCache } = require("./redis");
const { crawlWebsite } = require("./crawler");
const fs = require("fs");
require("dotenv").config();

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 10;
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

  // Create workers
  const workers = Array.from(
    { length: CONCURRENT_WORKERS },
    (_, i) =>
      new Worker(
        "crawlQueue",
        async (job) => {
          console.log(`Worker ${i + 1} processing: ${job.data.url}`);
          return crawlWebsite(job.data.url);
        },
        {
          connection: redis,
          concurrency: 1,
          limiter: { max: 1, duration: 2000 }, // More conservative rate limiting
          settings: {
            lockDuration: 30000,
            stalledInterval: 30000,
          },
        }
      )
  );

  // Add jobs with unique job IDs to prevent duplicates
  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((domain) =>
        crawlQueue.add(
          "crawl",
          { url: domain },
          {
            jobId: domain, // Use URL as job ID for deduplication
            removeOnComplete: true,
            removeOnFail: 10,
          }
        )
      )
    );
    console.log(`Added batch ${Math.floor(i / BATCH_SIZE) + 1}`);
  }

  try {
    // Wait for minimum processing time
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Process results in parallel with streaming write
    const resultsStream = fs.createWriteStream("product_urls.json");
    resultsStream.write("{\n");

    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      const productUrls = await redis.smembers(`product_urls:${domain}`);
      const name = domain.match(/https?:\/\/(www\.)?([^./]+)\./)[2];

      resultsStream.write(`  "${domain}": {\n`);
      resultsStream.write(`    "name": "${name}",\n`);
      resultsStream.write(`    "urls": [\n`);

      // Write URLs in smaller chunks
      const CHUNK_SIZE = 50;
      for (let j = 0; j < productUrls.length; j += CHUNK_SIZE) {
        const chunk = productUrls.slice(j, j + CHUNK_SIZE);
        const urlsString = chunk.map((url) => `      "${url}"`).join(",\n");
        resultsStream.write(
          urlsString + (j + CHUNK_SIZE < productUrls.length ? ",\n" : "\n")
        );
      }

      resultsStream.write("    ]");
      resultsStream.write(i === domains.length - 1 ? "\n  }\n" : "\n  },\n");
    }

    resultsStream.write("}\n");
    resultsStream.end();

    // Wait for file writing to complete
    await new Promise((resolve) => resultsStream.on("finish", resolve));
    console.log("Results written to product_urls.json");
  } catch (error) {
    console.error("Crawl failed:", error.message);
  } finally {
    // Cleanup
    await Promise.all(workers.map((worker) => worker.close()));
    await crawlQueue.close();
  }
})().catch(console.error);
