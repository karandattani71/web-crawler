class ScrollDetector {
  constructor(maxScrolls = 10) {
    this.maxScrolls = maxScrolls;
    this.lastHeight = 0;
    this.sameHeightCount = 0;
  }

  async detectInfiniteScroll(page) {
    let scrollCount = 0;
    
    while (scrollCount < this.maxScrolls) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === this.lastHeight) {
        this.sameHeightCount++;
        if (this.sameHeightCount >= 3) {
          // Content stopped loading after 3 same-height detections
          break;
        }
      } else {
        this.sameHeightCount = 0;
      }

      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      
      await page.waitForTimeout(1000); // Wait for content to load
      this.lastHeight = currentHeight;
      scrollCount++;
    }
  }
}

module.exports = ScrollDetector;
