import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { BotRenderer } from "../src/renderer.mjs";
import { normalizedTweet } from "./fixtures.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : undefined);

test("browser editor and bot renderer share the working export surface", { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-e2e-"));
  let renderer;
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => normalizedTweet() },
    jobs: new MemoryJobQueue(),
    renderBot: (payload) => renderer.render(payload)
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  renderer = new BotRenderer({ origin, cacheDir, executablePath: chromePath });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByLabel("推文永久链接").fill("https://x.com/minatoaqua/status/1383771374183878658");
    await page.getByRole("button", { name: "查询" }).click();
    const translation = page.getByPlaceholder("输入中文翻译（留空则只显示原文）");
    await translation.waitFor();
    await translation.fill("虽然麻烦不断，直播还是开始了！");
    await assert.doesNotReject(() => page.locator("#capture .translation-logo").waitFor());
    assert.match(await page.locator("#capture").innerText(), /直播还是开始了/);

    await page.evaluate((data) => window.TweetToaster.renderForBot(data), {
      data: normalizedTweet(),
      translate: "兼容模板",
      template: "<!--样式一--><style>.bad{color:red}</style><div>FIRST {T}</div><!--样式一--><!--样式二--><div>SECOND {T}</div><!--样式二-->",
      logo: "none",
      noLikes: true
    });
    const legacyText = await page.locator("#capture").innerText();
    assert.match(legacyText, /FIRST 兼容模板/);
    assert.doesNotMatch(legacyText, /SECOND/);
    assert.doesNotMatch(legacyText, /\.bad/);

    const filename = await renderer.render({
      data: normalizedTweet(),
      translate: "虽然麻烦不断，直播还是开始了！",
      template: "",
      logo: "official",
      noLikes: false
    });
    const output = path.join(cacheDir, `${filename}.png`);
    assert.ok((await stat(output)).size > 10000);
    const signature = await readFile(output);
    assert.deepEqual([...signature.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await browser.close();
    await renderer.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
