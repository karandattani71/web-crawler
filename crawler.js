const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const axios = require("axios");
const cheerio = require("cheerio");
const { redis } = require("./redis");

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const PRODUCT_PATTERNS = [
  /\/product\//, // General product pages (Amazon, Best Buy, etc.)
  /\/item\//, // eBay, Walmart
  /\/p\//, // Flipkart, AliExpress
  /\/products?\//, // Shopify, WooCommerce (supports /products/ and /product/)
  /\/dp\/[A-Z0-9]+/, // Amazon product pages (e.g., /dp/B08J5F3G18)
  /\/gp\/product\/[A-Z0-9]+/, // Amazon global product pattern
  /\/prod\//, // General small retailers
  /\/detail\//, // Target, AliExpress
  /\/details\//, // Various e-commerce sites
  /\/sku\//, // B2B and inventory sites
  /\/buy\//, // Generic buy pages
  /\/store\/products?\//, // Various platforms (supports singular/plural)
  /\/catalog\/product\//, // Magento-based stores
  /\/shop\//, // WooCommerce, BigCommerce
  /\/product-page\//, // Custom e-commerce sites
  /\/view\/[A-Za-z0-9_-]+/, // Some unique patterns (Magento, BigCommerce)
  /\/goods\/[0-9]+/, // Taobao, JD.com
  /\/offer\//, // Some marketplaces use /offer/ for product pages
];

const isProductUrl = (url) =>
  PRODUCT_PATTERNS.some((pattern) => pattern.test(url));

const axiosConfig = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  },
};

/**
 * Extract product URLs from a static HTML page using Cheerio
 */
const scrapeStaticPage = async (url) => {
  try {
    const { data } = await axios.get(url, { ...axiosConfig, timeout: 10000 });
    const $ = cheerio.load(data);
    const productUrls = [];

    $("a").each((_, element) => {
      const link = $(element).attr("href");
      if (link && isProductUrl(link)) {
        productUrls.push(new URL(link, url).href);
      }
    });

    return productUrls;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || (error.response && error.response.status >= 400) || error.message.includes('timeout') || error.message.includes('40')) {
      console.error(`Error scraping static page ${url}: ${error.message}`);
      return [];
    }
    throw error;
  }
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Extract product URLs from a dynamic JavaScript-rendered page using Puppeteer
 */
const scrapeDynamicPage = async (url) => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    await page.setUserAgent(axiosConfig.headers["User-Agent"]);
    await page.goto(url, { 
      waitUntil: "networkidle2", 
      timeout: 30000 
    });

    // Smooth scrolling with dynamic content detection
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    while (scrollAttempts < maxScrollAttempts) {
      const currentHeight = await page.evaluate('document.body.scrollHeight');
      
      await page.evaluate(`
        window.scrollTo({
          top: ${currentHeight},
          behavior: 'smooth'
        });
      `);

      // Use delay instead of waitForTimeout
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === previousHeight) {
        scrollAttempts++;
        if (scrollAttempts >= 3) break; // Stop if height hasn't changed for 3 attempts
      } else {
        scrollAttempts = 0;
      }
      previousHeight = newHeight;

      // Look for "load more" or similar buttons
      const loadMoreButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
        return buttons.find(button => {
          const text = button.textContent.toLowerCase();
          return text.includes('load more') || 
                 text.includes('show more') || 
                 text.includes('view more');
        });
      });

      if (loadMoreButton) {
        await page.evaluate(button => button.click(), loadMoreButton);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for content to load
      }
    }

    // Extract all product links after scrolling
    const links = await page.evaluate(() => {
      const uniqueLinks = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        if (a.href.includes('/product/') || 
            a.href.includes('/dp/') || 
            a.href.includes('/p/')) {
          uniqueLinks.add(a.href);
        }
      });
      return Array.from(uniqueLinks);
    });

    return links;
  } catch (error) {
    if (error.message.includes('timeout') || error.message.includes('Navigation failed') || error.message.includes('40')) {
      console.error(`Error scraping dynamic page ${url}: ${error.message}`);
      return [];
    }
    throw error;
  } finally {
    await browser.close();
  }
};

/**
 * Crawl a website and extract product URLs
 */
const crawlWebsite = async (url, retryCount = 0) => {
  try {
    const normalizedUrl = new URL(url).href.replace(/\/$/, '');

    // Only check visited status on first attempt, not retries
    if (retryCount === 0 && await redis.sismember("visited_urls", normalizedUrl)) {
      console.log(`Skipping already visited URL: ${normalizedUrl}`);
      return [];
    }

    console.log(`Crawling: ${normalizedUrl}`);
    
    const staticUrls = await scrapeStaticPage(url);
    const dynamicUrls = await scrapeDynamicPage(url);

    const allProductUrls = [...new Set([...staticUrls, ...dynamicUrls])];

    if (allProductUrls.length > 0) {
      console.log(`Found ${allProductUrls.length} product URLs on ${normalizedUrl}`);
      // Only mark as visited and store URLs if we found products
      await redis.sadd("visited_urls", normalizedUrl);
      await redis.sadd(`product_urls:${normalizedUrl}`, ...allProductUrls);
      console.log(`Stored ${allProductUrls.length} URLs for ${normalizedUrl}`); // Debugging line
      return allProductUrls;
    } else {
      console.log(`No product URLs found on ${normalizedUrl}`);
      return [];
    }

  } catch (error) {
    console.error(`Skipping domain ${url} due to error: ${error.message}`);
    return [];
  }
};

module.exports = { crawlWebsite };
