import { chromium } from "playwright";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const FB_VIDEO_URL = process.env.FB_VIDEO_URL || "";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "3000", 10);

if (!FB_VIDEO_URL) {
  console.error("ERROR: Set FB_VIDEO_URL env variable (e.g. https://www.facebook.com/YourPage/videos/123456)");
  process.exit(1);
}

const seenComments = new Set();

async function postComment(text, user) {
  try {
    const res = await fetch(`${BACKEND_URL}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, user }),
    });
    if (res.ok) {
      const order = await res.json();
      console.log(`[ORDER] ${user}: "${text}" → order ${order.id}`);
    } else {
      const err = await res.text();
      console.log(`[SKIP] ${user}: "${text}" → ${err}`);
    }
  } catch (e) {
    console.error(`[ERROR] Failed to post comment: ${e.message}`);
  }
}

async function scrapeComments(page) {
  const comments = await page.evaluate(() => {
    const results = [];
    // Facebook live comments are in various container elements
    // Try multiple selectors that Facebook uses
    const selectors = [
      '[data-testid="UFI2Comment/body"]',
      'div[dir="auto"][style*="text-align"]',
      'ul[class] > li div[dir="auto"]',
      // Generic fallback: look for comment-like structures
      'div[role="article"] div[dir="auto"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el) => {
          const text = el.innerText?.trim();
          if (text && text.length < 200) {
            // Try to find the author name nearby
            const article = el.closest('[role="article"]') || el.closest("li") || el.parentElement?.parentElement;
            const authorEl = article?.querySelector("a[role='link'] > span, a > strong, h3 span, h4 span");
            const author = authorEl?.innerText?.trim() || "unknown";
            results.push({ text, author });
          }
        });
        if (results.length > 0) break;
      }
    }
    return results;
  });

  return comments;
}

async function main() {
  console.log(`Starting Facebook Live comment scraper`);
  console.log(`Video URL: ${FB_VIDEO_URL}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  console.log();

  const browser = await chromium.launch({
    headless: false, // Use headed mode so you can log in to Facebook
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  // Navigate to the video
  console.log("Opening Facebook Live page...");
  console.log(">>> If prompted, LOG IN to Facebook in the browser window <<<");
  console.log();
  await page.goto(FB_VIDEO_URL, { waitUntil: "domcontentloaded" });

  // Wait for user to log in if needed
  console.log("Waiting 15 seconds for page to load (log in if needed)...");
  await page.waitForTimeout(15000);

  // Close any popups (cookie consent, login prompts, etc.)
  try {
    const closeButtons = await page.$$('[aria-label="Close"], [data-testid="cookie-policy-manage-dialog-accept-button"]');
    for (const btn of closeButtons) {
      await btn.click().catch(() => {});
    }
  } catch {
    // ignore
  }

  console.log("Starting comment polling...");
  console.log();

  // Poll loop
  setInterval(async () => {
    try {
      const comments = await scrapeComments(page);

      for (const { text, author } of comments) {
        // Create a unique key for deduplication
        const key = `${author}:${text}`;
        if (seenComments.has(key)) continue;
        seenComments.add(key);

        console.log(`[COMMENT] ${author}: ${text}`);

        // Only forward comments that look like claims (number + phone)
        if (/^\d{1,2}\s+\d+/.test(text)) {
          await postComment(text, author);
        }
      }
    } catch (e) {
      console.error(`[ERROR] Scrape failed: ${e.message}`);
    }
  }, POLL_INTERVAL);

  // Keep alive
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await browser.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
