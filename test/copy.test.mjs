import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { normalizedConversation } from "./fixtures.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : undefined);

test("compact homepage keeps useful instructions and works through query and reset", { timeout: 30000 }, async () => {
  const jobs = new MemoryJobQueue();
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => normalizedConversation() },
    jobs,
    renderBot: async () => "unused"
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    for (const width of [320, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 780 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      assert.doesNotMatch(body, /把推文和翻译|从一条推文开始|开始烤图|不用再来回 P 图|下一张烤推/);
      assert.equal(await page.locator("#welcome-guide, .query-intro").count(), 0);
      assert.ok((await page.locator("#query-button").boundingBox()).y < 240, "the query should be the first task, not follow a tutorial");
      assert.match(await page.locator(".field-help").textContent(), /主页.*近期推文/);
      assert.match(await page.locator(".library-privacy").textContent(), /浏览器.*原尺寸.*临时上传/);
      assert.match(await page.locator(".template-details").textContent(), /\{T\}/);
      assert.equal(await page.locator("#preview-hint").textContent(), "暂无推文");
      assert.equal(await page.locator(".preview-quality").textContent(), "1280px PNG");

      await page.locator("#tweet-url").fill("test_user");
      await page.locator("#query-button").click();
      await page.locator("#translation-panel").waitFor({ state: "visible" });
      assert.equal(await page.locator(".translation-item").count(), 2);
      assert.match(await page.locator("#translation-panel .panel-heading p").textContent(), /推文或回复/);
      await page.locator("#reset-button").click();
      assert.equal(await page.locator("#tweet-url").inputValue(), "");
      assert.equal(await page.locator("#translation-panel").isVisible(), false);
      assert.equal(await page.locator("#preview-hint").textContent(), "暂无推文");
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
    await jobs.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
