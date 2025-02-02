# E-commerce Product URL Crawler

A scalable web crawler designed to discover and list product URLs from multiple e-commerce websites. Built with Node.js, BullMQ, Redis, and Puppeteer.

## Features

- 🔍 Smart URL Discovery: Identifies product pages using common e-commerce URL patterns
- ⚡ Parallel Processing: Uses BullMQ for job queue management and parallel crawling 
- 🚦 Rate Limiting: Implements respectful crawling with configurable rate limits
- 💾 Caching: Uses Redis for deduplication and storing discovered URLs
- 🔄 Dynamic Content: Handles infinite scrolling and JavaScript-rendered content
- 🛡️ Stealth Mode: Uses Puppeteer with stealth plugins to avoid detection
- 🔁 Retry Logic: Implements automatic retries for failed requests

## Technical Stack

- **Node.js**: Runtime environment
- **BullMQ**: Job queue for parallel processing
- **Redis**: Caching and job queue backend
- **Puppeteer**: Headless browser automation
- **Cheerio**: Static HTML parsing
- **Axios**: HTTP client for static page fetching

## Architecture

The crawler implements a distributed architecture with the following components:

1. **Queue System (BullMQ)**
   - Manages crawl jobs across multiple workers
   - Handles job retries and failures
   - Implements rate limiting per worker

2. **Worker Pool**
   - Configurable number of concurrent workers
   - Each worker handles one domain at a time
   - Implements backoff strategies for failed attempts

3. **Crawling Strategies**
   - Static page crawling using Axios + Cheerio
   - Dynamic page crawling using Puppeteer
   - Smart scroll detection for infinite scrolling pages

4. **URL Management**
   - Redis-based URL deduplication
   - Product URL pattern matching
   - Normalized URL storage

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=your_password
```

3. Start Redis server

4. Run the crawler:
```bash
node index.js
```

## Configuration

Key configuration options in `index.js`:

```javascript
const BATCH_SIZE = 5;            // Number of domains per batch
const CONCURRENT_WORKERS = 5;     // Number of parallel workers
const CRAWL_TIMEOUT = 120000;    // Crawl timeout (2 minutes)
```

Rate limiting in `WorkerPool.js`:
```javascript
limiter: {
  max: 2,              // Max requests
  duration: 1000       // Per second per worker
}
```

## Output

The crawler generates a JSON file (`product_urls.json`) with the following structure:

```json
{
  "https://example.com": {
    "name": "example",
    "urls": [
      "https://example.com/product/1",
      "https://example.com/product/2"
    ]
  }
}
```

## Error Handling

- Implements retry logic for failed requests
- Logs errors with detailed information
- Graceful shutdown on process termination
- Handles edge cases like:
  - Invalid URLs
  - Network timeouts
  - Rate limiting responses
  - Dynamic content loading failures

## Performance Considerations

- Uses connection pooling for Redis
- Implements streaming for large result sets
- Batch processing of URLs
- Memory-efficient URL storage
- Configurable concurrency limits

## Future Improvements

1. **Monitoring**
   - Add metrics collection
   - Dashboard for crawl progress
   - Alert system for failures

2. **Scalability**
   - Kubernetes deployment support
   - Distributed crawler nodes
   - Load balancing

3. **Features**
   - Product data extraction
   - Sitemap support
   - Proxy rotation
   - Custom crawler rules per domain

## License

ISC