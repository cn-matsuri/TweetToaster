import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { BotRenderer } from "../src/renderer.mjs";
import { normalizedConversation, normalizedTweet } from "./fixtures.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : undefined);

test("browser editor and bot renderer share the working export surface", { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-e2e-"));
  let renderer;
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => normalizedConversation() },
    jobs: new MemoryJobQueue(),
    renderBot: (payload) => renderer.render(payload),
    cacheDir
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  renderer = new BotRenderer({ origin, cacheDir, executablePath: chromePath });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.locator("#logo-select option").first().waitFor({ state: "attached" });
    const initialOptions = await page.locator("#logo-select option").allTextContents();
    assert.ok(initialOptions.length < 10, "the favorites dropdown must not expose the full catalog");
    assert.ok(initialOptions.some((label) => label.includes("夏色祭工坊")));

    await page.getByRole("button", { name: "管理常用与上传" }).click();
    await page.locator("#asset-library").waitFor({ state: "visible" });
    assert.equal(await page.locator("#builtin-assets-grid .asset-card").count(), 49);
    await page.getByPlaceholder("搜索角色、字幕组或模板名称").fill("兔田");
    const pekoraCard = page.locator("#builtin-assets-grid .asset-card").filter({ hasText: "兔田佩克拉" });
    await pekoraCard.getByRole("button", { name: "加入常用" }).click();
    await page.getByPlaceholder("搜索角色、字幕组或模板名称").fill("");

    const originalLogo = await readFile(path.resolve("Matsuri_translation/frontend/img/brand-logo.png"));
    const largeLocalLogo = Buffer.concat([originalLogo, Buffer.alloc(2 * 1024 * 1024, 0)]);
    await page.locator("#custom-logo").setInputFiles({
      name: "不会被压小的Logo.png",
      mimeType: "image/png",
      buffer: largeLocalLogo
    });
    await page.locator("#close-library").click();
    await page.locator("#logo-select").selectOption({ label: "不会被压小的Logo" });

    await page.getByLabel("X 主页、@用户名或推文链接").fill("minatoaqua");
    await page.getByRole("button", { name: "查询" }).click();
    const translation = page.getByPlaceholder("输入中文翻译（留空则只显示原文）").first();
    await translation.waitFor();
    await translation.fill("虽然麻烦不断，直播还是开始了！");
    await page.getByLabel("包含 @fan 的第 2 条推文").check();
    await page.getByPlaceholder("输入中文翻译（留空则只显示原文）").nth(1).fill("回复也可以单独翻译。");
    await assert.doesNotReject(() => page.locator("#capture .translation-logo").first().waitFor());
    assert.match(await page.locator("#capture").innerText(), /直播还是开始了/);
    assert.match(await page.locator("#capture").innerText(), /回复也可以单独翻译/);

    const logoDimensions = await page.locator("#capture .translation-logo").first().evaluate((image) => ({
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight
    }));
    assert.ok(Math.abs((logoDimensions.width / logoDimensions.height) - (logoDimensions.naturalWidth / logoDimensions.naturalHeight)) < 0.02);
    assert.equal(logoDimensions.width, Math.min(logoDimensions.naturalWidth, 568));

    await page.evaluate(() => {
      window.__customLogoPng = null;
      window.saveAs = async (blob) => {
        const bytes = await blob.arrayBuffer();
        window.__customLogoPng = { size: blob.size, width: new DataView(bytes).getUint32(16) };
      };
    });
    await page.getByRole("button", { name: "下载 PNG" }).click();
    await page.waitForFunction(() => window.__customLogoPng !== null || document.querySelector("#status")?.classList.contains("error"), null, { timeout: 45000 });
    const customLogoExport = await page.evaluate(() => ({ png: window.__customLogoPng, status: document.querySelector("#status")?.textContent }));
    assert.ok(customLogoExport.png, customLogoExport.status);
    assert.equal(customLogoExport.png.width, 1280);
    assert.ok(customLogoExport.png.size > 10000);

    await page.locator(".template-details summary").click();
    await page.locator("#template-input").fill("<div style=\"font-size:29px\">持久模板 {T}</div>");
    await page.locator("#template-name").fill("我的长期模板");
    await page.getByRole("button", { name: "保存到我的模板" }).click();
    await page.locator("#logo-select option", { hasText: "我的长期模板" }).waitFor({ state: "attached" });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#logo-select option").first().waitFor({ state: "attached" });
    const persistedOptions = await page.locator("#logo-select option").allTextContents();
    assert.ok(persistedOptions.some((label) => label.includes("不会被压小的Logo")));
    assert.ok(persistedOptions.some((label) => label.includes("我的长期模板")));
    assert.ok(persistedOptions.some((label) => label.includes("兔田佩克拉")));
    assert.equal(await page.locator("#template-input").inputValue(), "<div style=\"font-size:29px\">持久模板 {T}</div>");

    await page.locator("#logo-select").selectOption("builtin:matsuri");
    await page.getByLabel("X 主页、@用户名或推文链接").fill("minatoaqua");
    await page.getByRole("button", { name: "查询" }).click();
    const restoredTranslation = page.getByPlaceholder("输入中文翻译（留空则只显示原文）").first();
    await restoredTranslation.waitFor();
    await restoredTranslation.fill("虽然麻烦不断，直播还是开始了！");
    const templatedTranslation = page.locator("#capture .template-translation-text").first();
    await page.locator("#font-size-select").selectOption("30");
    assert.equal(await templatedTranslation.evaluate((node) => getComputedStyle(node).fontSize), "30px");
    await page.locator("#font-size-select").selectOption("23");
    assert.equal(await templatedTranslation.evaluate((node) => getComputedStyle(node).fontSize), "23px");
    const builtinLogoDimensions = await page.locator("#capture .translation-block img").first().evaluate((image) => ({
      width: image.getBoundingClientRect().width,
      naturalWidth: image.naturalWidth
    }));
    assert.equal(builtinLogoDimensions.width, builtinLogoDimensions.naturalWidth);

    await page.evaluate(() => {
      window.__savedPng = null;
      window.saveAs = async (blob, name) => {
        const bytes = await blob.arrayBuffer();
        window.__savedPng = {
          name,
          size: blob.size,
          width: new DataView(bytes).getUint32(16)
        };
      };
    });
    await page.getByRole("button", { name: "下载 PNG" }).click();
    await page.waitForFunction(() => window.__savedPng !== null || document.querySelector("#status")?.classList.contains("error"), null, { timeout: 45000 });
    const outcome = await page.evaluate(() => ({ savedPng: window.__savedPng, status: document.querySelector("#status")?.textContent }));
    assert.ok(outcome.savedPng, outcome.status);
    const savedPng = outcome.savedPng;
    assert.equal(savedPng.width, 1280);
    assert.ok(savedPng.size > 10000);
    assert.match(savedPng.name, /^TweetToaster-minatoaqua-/);

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
    assert.equal(signature.readUInt32BE(16), 1280);
  } finally {
    await browser.close();
    await renderer.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
