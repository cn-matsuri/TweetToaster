import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { BotRenderer } from "../src/renderer.mjs";
import { normalizedConversation } from "./fixtures.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : undefined);

test("downloaded PNG preserves the preview timezone across UTC, date boundaries and DST", { timeout: 60000 }, async () => {
  const data = normalizedConversation();
  data.tweets[0].createdAt = "2026-01-01T20:16:00Z";
  data.tweets[1].createdAt = "2026-07-01T20:16:00Z";
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-timezone-"));
  let renderer;
  let submittedTimeZone;
  let exportedDates;
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => data },
    jobs: new MemoryJobQueue(),
    renderBot: (payload) => {
      submittedTimeZone = payload.timeZone;
      return renderer.render(payload);
    },
    cacheDir
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  renderer = new BotRenderer({ origin, cacheDir, executablePath: chromePath });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await renderer.start();
    const newPage = renderer.browser.newPage.bind(renderer.browser);
    renderer.browser.newPage = async (options) => {
      // Reproduce production's UTC Chromium independently of the developer machine.
      const page = await newPage({ ...options, timezoneId: "UTC" });
      const close = page.close.bind(page);
      page.close = async () => {
        // Observe the real page after the renderer has taken its PNG screenshot.
        exportedDates = await page.locator("#capture .tweet-meta").allTextContents();
        assert.equal(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), "UTC");
        return close();
      };
      return page;
    };

    for (const [timeZone, expectedDates] of [
      ["Asia/Shanghai", ["2026年1月2日 04:16", "2026年7月2日 04:16"]],
      ["America/New_York", ["2026年1月1日 15:16", "2026年7月1日 16:16"]],
      ["Asia/Kathmandu", ["2026年1月2日 02:01", "2026年7月2日 02:01"]],
      ["UTC", ["2026年1月1日 20:16", "2026年7月1日 20:16"]]
    ]) {
      const page = await browser.newPage({ timezoneId: timeZone });
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByLabel("X 主页、@用户名或推文链接").fill("minatoaqua");
      await page.getByRole("button", { name: "查询", exact: true }).click();
      await page.getByLabel("包含 @fan 的第 2 条推文").check();
      const previewDates = await page.locator("#capture .tweet-meta").allTextContents();
      assert.deepEqual(previewDates, expectedDates, `${timeZone}: preview timestamps`);
      await page.evaluate(() => {
        window.__timezonePng = null;
        window.saveAs = async (blob) => {
          const bytes = new DataView(await blob.arrayBuffer());
          window.__timezonePng = { size: blob.size, width: bytes.getUint32(16) };
        };
      });
      await page.getByRole("button", { name: "下载 PNG" }).click();
      await page.waitForFunction(() => window.__timezonePng || document.querySelector("#status")?.classList.contains("error"));
      const result = await page.evaluate(() => ({ png: window.__timezonePng, status: document.querySelector("#status").textContent }));
      assert.ok(result.png, result.status);
      assert.equal(result.png.width, 1280);
      assert.ok(result.png.size > 10000);
      assert.deepEqual(exportedDates, previewDates, `${timeZone}: PNG timestamps must match the preview, not the UTC server`);
      assert.ok(submittedTimeZone, `${timeZone}: export request must carry the browser timezone`);
      await page.close();
    }
  } finally {
    await browser.close();
    await renderer.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
