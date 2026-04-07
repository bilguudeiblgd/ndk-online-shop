import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const FB_VIDEO_URL = process.env.FB_VIDEO_URL || "";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "3000", 10);
const PROFILE_DIR = join(process.cwd(), ".browser-profile");

if (!FB_VIDEO_URL) {
  console.error(
    "ERROR: Set FB_VIDEO_URL env variable\n" +
      'Example: FB_VIDEO_URL="https://www.facebook.com/YourPage/videos/123456" npm start'
  );
  process.exit(1);
}

// Ensure profile directory exists for persistent login
if (!existsSync(PROFILE_DIR)) {
  mkdirSync(PROFILE_DIR, { recursive: true });
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
      console.log(`  ✓ ORDER created: ${order.id} (${user})`);
    } else {
      const err = await res.text();
      console.log(`  → skipped: ${err}`);
    }
  } catch (e) {
    console.error(`  ✗ backend error: ${e.message}`);
  }
}

async function scrapeComments(page) {
  return await page.evaluate(() => {
    const results = [];

    // Strategy: find all comment containers and extract text + author
    // Facebook wraps live comments in list items or article-like divs
    const commentContainers = document.querySelectorAll(
      // Live comment list items
      'ul li[class], div[role="article"]'
    );

    for (const container of commentContainers) {
      // Get all text nodes that look like comment body
      const textEls = container.querySelectorAll('div[dir="auto"], span[dir="auto"]');
      let commentText = "";
      for (const el of textEls) {
        const t = el.innerText?.trim();
        // Skip very long or empty strings, skip author names (they're usually short and in links)
        if (t && t.length > 0 && t.length < 200) {
          // Check if this element is inside a link (likely author name)
          if (!el.closest("a") && !el.closest("h3") && !el.closest("h4")) {
            commentText = t;
            break;
          }
        }
      }

      if (!commentText) continue;

      // Find author: usually in an <a> with role="link" or a <strong>
      let author = "unknown";
      const authorEl =
        container.querySelector("a[role='link'] span") ||
        container.querySelector("a > strong") ||
        container.querySelector("a > span");
      if (authorEl) {
        const name = authorEl.innerText?.trim();
        if (name && name.length < 100) author = name;
      }

      results.push({ text: commentText, author });
    }

    return results;
  });
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Facebook Live Comment Scraper          ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`Video:    ${FB_VIDEO_URL}`);
  console.log(`Backend:  ${BACKEND_URL}`);
  console.log(`Interval: ${POLL_INTERVAL}ms`);
  console.log(`Profile:  ${PROFILE_DIR}`);
  console.log();

  // Use persistent context so Facebook login is remembered between runs
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || (await context.newPage());

  console.log("Opening Facebook Live page...");
  await page.goto(FB_VIDEO_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Check if we need to log in
  const url = page.url();
  if (url.includes("login") || url.includes("checkpoint")) {
    console.log();
    console.log(">>> You need to LOG IN in the browser window <<<");
    console.log(">>> After logging in, the scraper will continue automatically <<<");
    console.log();

    // Wait for navigation away from login page (up to 5 minutes)
    await page.waitForURL("**/facebook.com/**", { timeout: 300000 }).catch(() => {});

    // Navigate to the video after login
    await page.goto(FB_VIDEO_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  // Wait for page to fully load
  console.log("Waiting for page to load...");
  await page.waitForTimeout(5000);

  // Try to dismiss popups
  try {
    const dismissSelectors = [
      '[aria-label="Close"]',
      '[data-testid="cookie-policy-manage-dialog-accept-button"]',
      'div[role="button"]:has-text("Allow")',
      'div[role="button"]:has-text("Not Now")',
    ];
    for (const sel of dismissSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  } catch {
    // ignore popup dismissal errors
  }

  console.log();
  console.log("Scraping comments... (press Ctrl+C to stop)");
  console.log("Comments matching '<code> <phone>' will create orders.");
  console.log("─".repeat(50));
  console.log();

  // Poll loop
  const interval = setInterval(async () => {
    try {
      const comments = await scrapeComments(page);

      for (const { text, author } of comments) {
        const key = `${author}:${text}`;
        if (seenComments.has(key)) continue;
        seenComments.add(key);

        console.log(`[${author}] ${text}`);

        // Forward comments matching claim format: <1-2 digit code> <phone number>
        if (/^\d{1,2}\s+\d+/.test(text)) {
          await postComment(text, author);
        }
      }
    } catch (e) {
      // Page might be navigating, just retry next tick
    }
  }, POLL_INTERVAL);

  // Cleanup on exit
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    clearInterval(interval);
    await context.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
