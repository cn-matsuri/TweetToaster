import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { normalizedConversation, normalizedTweet } from "./fixtures.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : undefined);
const templateRoot = path.resolve(import.meta.dirname, "../Matsuri_translation/frontend/templates");

test("every bundled template renders its real logo without distortion or overflow", { timeout: 60000 }, async () => {
  const catalog = JSON.parse(await readFile(path.join(templateRoot, "catalog.json"), "utf8"));
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => normalizedTweet() },
    jobs: new MemoryJobQueue(),
    renderBot: async () => "unused"
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage({ viewport: { width: 720, height: 1200 } });
    await page.goto(`${origin}/?render=1`, { waitUntil: "networkidle" });
    for (const item of catalog.templates) {
      const template = await readFile(path.join(templateRoot, item.file), "utf8");
      await page.evaluate(({ data, template }) => window.TweetToaster.renderForBot({
        data,
        translate: "模板实际渲染测试",
        template,
        logo: "none",
        noLikes: true
      }), { data: normalizedTweet(), template });
      const result = await page.locator("#capture .translation-block").evaluate((block) => {
        const images = [...block.querySelectorAll("img")].map((image) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          width: image.getBoundingClientRect().width,
          height: image.getBoundingClientRect().height
        }));
        return {
          images,
          clientWidth: block.clientWidth,
          scrollWidth: block.scrollWidth,
          text: block.textContent
        };
      });
      assert.match(result.text, /模板实际渲染测试/, `${item.file}: translation is missing`);
      assert.ok(result.images.length > 0, `${item.file}: logo is missing`);
      assert.ok(result.scrollWidth <= result.clientWidth, `${item.file}: content overflows the 640px export surface`);
      for (const image of result.images) {
        assert.ok(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0, `${item.file}: logo did not load`);
        assert.ok(image.width <= 568 && image.height > 0, `${item.file}: logo exceeds the content area`);
        const naturalRatio = image.naturalWidth / image.naturalHeight;
        const renderedRatio = image.width / image.height;
        assert.ok(Math.abs(naturalRatio - renderedRatio) < 0.02, `${item.file}: logo aspect ratio was changed`);
        if (image.naturalWidth <= 538) assert.equal(image.width, image.naturalWidth, `${item.file}: logo was unnecessarily shrunk`);
      }
    }

    const matsuri = await readFile(path.join(templateRoot, "matsuri.txt"), "utf8");
    const conversation = normalizedConversation();
    await page.evaluate(({ data, template }) => window.TweetToaster.renderForBot({
      data,
      selection: data.tweets.slice(0, 2).map((tweet, index) => ({ id: tweet.id, translation: `翻译 ${index + 1}` })),
      template,
      logo: "none",
      noLikes: true
    }), { data: conversation, template: matsuri });
    assert.equal(await page.locator("#capture .translation-block img").count(), 2,
      "explicit browser selections must use the same logo template for replies as the editor preview");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
