# E-commerce Product URL Crawler

A distributed web crawler that extracts product URLs from major e-commerce websites using BullMQ for job queues and Redis for caching.

## Features

- Concurrent web crawling with configurable workers
- Distributed job processing with BullMQ
- Redis-based caching and job management
- Both static (Axios/Cheerio) and dynamic (Puppeteer) crawling
- Automatic rate limiting and retry mechanisms
- Real-time metrics collection
- Graceful shutdown handling
- Product URL pattern detection
- Deduplication of URLs

## Technologies Used

- Node.js
- Redis
- BullMQ
- Puppeteer
- Cheerio
- Axios

## Dependencies

## Technical Stack

- **Node.js**: Runtime environment
- **BullMQ**: Job queue for parallel processing
- **Redis**: Caching and job queue backend
- **Puppeteer**: Headless browser automation
- **Cheerio**: Static HTML parsing
- **Axios**: HTTP client for static page fetching

## Architecture

### Components

1. **Queue System** (queue.js)

   - BullMQ for job distribution
   - Queue event monitoring
   - Real-time metrics collection
   - Configurable job options

2. **Worker Pool** (workers/WorkerPool.js)

   - Dynamic worker scaling
   - Worker thread management
   - Error handling and retries
   - Performance metrics

3. **Crawler Engine** (crawler.js)

   - Dual crawling strategies (static/dynamic)
   - Product URL pattern matching

4. **Redis Layer** (redis.js)
   - Connection management
   - Error handling
   - Cache management
   - Event monitoring

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
DOMAINS=["https://www.amazon.com","https://www.flipkart.com"]
```

3. Start Redis server

4. Run the crawler:

```bash
node index.js
```

## Configuration

Key configuration options in `index.js`:

```javascript
const BATCH_SIZE = 5; // Number of domains per batch
const CONCURRENT_WORKERS = 5; // Number of parallel workers
const CRAWL_TIMEOUT = 120000; // Crawl timeout (2 minutes)
```

Rate limiting in `WorkerPool.js`:

```javascript
limiter: {
  max: 2,              // Max requests
  duration: 1000       // Per second per worker
}
```

## Environment Variables

## Output

The crawler generates a JSON file (`product_urls.json`) with the following structure:

```json
{
  "https://example.com": {
    "name": "example",
    "urls": ["https://example.com/product/1", "https://example.com/product/2"]
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
