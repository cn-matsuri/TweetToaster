import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { devices } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { BotRenderer } from "../src/renderer.mjs";
import { normalizedConversation } from "./fixtures.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);

async function noHorizontalOverflow(page) {
  const size = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, JSON.stringify(size));
}

async function language(page, value) {
  await page.locator(`#language-switch button[data-language='${value}']`).click();
  await page.waitForFunction((expected) => window.TweetToasterI18n.getLanguage() === expected, value);
  assert.equal(await page.locator("html").getAttribute("lang"), value === "zh" ? "zh-CN" : "en");
  assert.equal(await currentLanguage(page), value);
}

const currentLanguage = (page) => page.locator("#language-switch [aria-checked='true']").getAttribute("data-language");

// Reuse exactly the same user-visible assertions in Chromium and WebKit.
// The server still renders PNGs in Chromium, just like the production image.
export async function localizationBrowserSuite(t, browserType) {
  const data = normalizedConversation();
  data.tweets[0].createdAt = "2026-01-01T20:16:00Z";
  data.tweets[1].createdAt = "2026-01-01T21:16:00Z";
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), `tweet-toaster-${browserType.name()}-i18n-`));
  const jobs = new MemoryJobQueue();
  let renderer;
  let renderPayload;
  let renderedPage;
  const server = createTweetToasterServer({
    provider: { fetchTweet: async (input) => {
      if (input === "failure") throw Object.assign(new Error("公开数据源暂时不可用"), { status: 503, code: "PROVIDER_UNAVAILABLE" });
      return structuredClone(data);
    } },
    jobs,
    renderBot: (payload, options) => { renderPayload = payload; return renderer.render(payload, options); },
    cacheDir
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  renderer = new BotRenderer({ origin, cacheDir, executablePath: chromePath });
  let browser;
  const errors = [];
  const newPage = async ({ width = 390, locale = "en-US", init, desktop = false } = {}) => {
    const page = await browser.newPage({
      ...(desktop ? {} : devices["iPhone 13"]),
      viewport: { width, height: 780 }, locale, timezoneId: "Asia/Shanghai",
      acceptDownloads: true
    });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    if (init) await page.addInitScript(init);
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.locator("#logo-select option[value='none']").waitFor({ state: "attached" });
    return page;
  };
  try {
    browser = await browserType.launch({ headless: true, ...(browserType.name() === "chromium" ? { executablePath: chromePath } : {}) });
    for (const width of [320, 375, 390, 1280]) {
      await t.test(`English and Chinese fit ${width}px with an accessible language switch`, async () => {
        const page = await newPage({ width, desktop: width === 1280 });
        try {
          assert.equal(await currentLanguage(page), "en");
          assert.equal(await page.locator("h1").textContent(), "TweetToaster");
          assert.equal(await page.title(), "TweetToaster");
          assert.match(await page.locator("#query-button").textContent(), /[a-z]/i);
          assert.equal(await page.locator("#language-switch").getAttribute("role"), "radiogroup");
          assert.equal(await page.locator("#language-switch [role='radio']").count(), 2);
          assert.equal(await page.locator("#language-select").count(), 0, "the language control is a direct toggle, not a dropdown");
          for (const value of ["en", "zh", "en"]) {
            await language(page, value);
            for (const selector of ["#language-switch", "#language-switch [data-language='en']", "#language-switch [data-language='zh']", "#tweet-url", "#query-button"]) {
              const box = await page.locator(selector).boundingBox();
              assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height < 780,
                `${selector} must be visible above the fold at ${width}px: ${JSON.stringify(box)}`);
            }
            await noHorizontalOverflow(page);
            if (process.env.TWEETTOASTER_TEST_SCREENSHOTS && (width === 320 || width === 1280)) {
              await page.screenshot({ path: path.join(process.env.TWEETTOASTER_TEST_SCREENSHOTS, `${browserType.name()}-${value}-${width}.png`), animations: "disabled" });
            }
          }
          await page.locator("#language-switch [aria-checked='true']").focus();
          for (const [key, value] of [["ArrowRight", "zh"], ["ArrowLeft", "en"], ["ArrowDown", "zh"], ["ArrowUp", "en"], ["End", "zh"], ["Home", "en"]]) {
            await page.locator("#language-switch [aria-checked='true']").press(key);
            assert.equal(await currentLanguage(page), value);
            assert.equal(await page.evaluate(() => document.activeElement.dataset.language), value);
            assert.deepEqual(await page.locator("#language-switch button").evaluateAll((buttons) => buttons.map((button) => button.tabIndex)), value === "en" ? [0, -1] : [-1, 0]);
          }
          await page.locator("#manage-assets").click();
          const dialog = page.locator("#asset-library");
          await dialog.waitFor({ state: "visible" });
          const bounds = await dialog.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
          await page.locator("#asset-search").fill("no-such-template-123");
          const emptyText = await page.locator(".empty-assets").textContent();
          assert.match(emptyText, /[a-z]/i);
          assert.doesNotMatch(emptyText, /[\u4e00-\u9fff]/);
          await page.locator("#close-library").click();
          assert.equal(await dialog.isVisible(), false);
        } finally { await page.close(); }
      });
    }

    await t.test("browser language defaults, saved choice, and unavailable localStorage are handled", async () => {
      for (const [locale, expected] of [["zh-TW", "zh"], ["en-GB", "en"], ["ja-JP", "en"]]) {
        const page = await newPage({ locale });
        try {
          assert.equal(await currentLanguage(page), expected);
          const selected = expected === "en" ? "zh" : "en";
          await language(page, selected);
          await page.reload({ waitUntil: "networkidle" });
          assert.equal(await currentLanguage(page), selected);
        } finally { await page.close(); }
      }
      const page = await newPage({ locale: "en-US", init: () => {
        Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Blocked", "SecurityError"); } });
      } });
      try {
        assert.equal(await currentLanguage(page), "en");
        await language(page, "zh");
        await language(page, "en");
        await page.locator("#tweet-url").fill("minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        assert.equal(await page.locator(".translation-item").count(), 2);
      } finally { await page.close(); }
    });

    await t.test("switching languages preserves edits, selection, logos, templates and actual PNG export", async () => {
      const page = await newPage();
      try {
        await page.locator("#manage-assets").click();
        await page.locator("#asset-search").fill("兔田");
        const found = page.locator("#builtin-assets-grid .asset-card").first();
        await found.waitFor();
        await found.locator(".pin-button").click();
        await page.locator("#asset-search").fill("");
        const originalLogo = await readFile(path.resolve("Matsuri_translation/frontend/img/brand-logo.png"));
        const logo = Buffer.concat([originalLogo, Buffer.alloc(2 * 1024 * 1024)]);
        await page.locator("#custom-logo").setInputFiles({ name: "Original Logo 中文.png", mimeType: "image/png", buffer: logo });
        const uploaded = page.locator("#logo-select option[value^='user:logo-']");
        await uploaded.waitFor({ state: "attached" });
        assert.equal(await page.locator("#status.error").count(), 0, await page.locator("#status").textContent());
        const libraryLogo = page.locator("#my-assets-grid img").first();
        const libraryWidth = await libraryLogo.evaluate(async (image) => {
          await image.decode();
          return image.naturalWidth;
        });
        assert.ok(libraryWidth > 0, "custom logo library thumbnails must not be blocked by CSP");
        const choice = await uploaded.getAttribute("value");
        await page.locator("#close-library").click();
        await page.locator("#logo-select").selectOption(choice);
        await page.locator("#tweet-url").fill("minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        await page.locator("#select-all").click();
        const values = ["English translation stays. 中文也不丢。", "A reply translated independently."];
        const fields = page.locator("#translation-list textarea");
        await fields.nth(0).fill(values[0]);
        await fields.nth(1).fill(values[1]);
        await page.locator("#font-size-select").selectOption("30");
        for (const value of ["zh", "en"]) {
          await language(page, value);
          assert.deepEqual(await fields.evaluateAll((nodes) => nodes.map((node) => node.value)), values);
          assert.deepEqual(await page.locator("#translation-list input[type=checkbox]").evaluateAll((nodes) => nodes.map((node) => node.checked)), [true, true]);
          assert.equal(await page.locator("#logo-select").inputValue(), choice);
          assert.equal(await page.locator("#font-size-select").inputValue(), "30");
        }
        await page.locator("#show-preview-button").click();
        await page.waitForFunction(() => Math.abs(document.querySelector("#capture-frame").getBoundingClientRect().height - document.querySelector("#capture").getBoundingClientRect().height) < 2);
        const dates = await page.locator("#capture .tweet-meta").allTextContents();
        assert.ok(dates.every((date) => /Jan|January/.test(date) && !/[年月日]/.test(date)), dates.join(" / "));
        const statistics = await page.locator("#capture .tweet-counts").first().textContent();
        assert.match(statistics, /replies|reposts|likes/i);
        assert.doesNotMatch(statistics, /回复|转发|喜欢/);
        const dimensions = await page.locator("#capture .translation-logo").first().evaluate((image) => ({
          width: image.offsetWidth, height: image.offsetHeight, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight
        }));
        assert.equal(dimensions.width, Math.min(dimensions.naturalWidth, 568));
        assert.ok(Math.abs(dimensions.width / dimensions.height - dimensions.naturalWidth / dimensions.naturalHeight) < 0.02);
        await noHorizontalOverflow(page);
        await renderer.start();
        const originalNewPage = renderer.browser.newPage.bind(renderer.browser);
        renderer.browser.newPage = async (options) => {
          const renderPage = await originalNewPage(options);
          const originalClose = renderPage.close.bind(renderPage);
          renderPage.close = async () => {
            renderedPage = {
              text: await renderPage.locator("#capture").innerText(),
              dates: await renderPage.locator("#capture .tweet-meta").allTextContents(),
              fontSize: await renderPage.locator("#capture .translation-text").first().evaluate((node) => getComputedStyle(node).fontSize)
            };
            return originalClose();
          };
          return renderPage;
        };
        const downloading = page.waitForEvent("download", { timeout: 60000 });
        await page.locator("#download-button").click();
        assert.equal(await page.locator("#language-switch").getAttribute("aria-disabled"), "true", "an in-progress export must keep the preview language stable");
        assert.deepEqual(await page.locator("#language-switch button").evaluateAll((buttons) => buttons.map((button) => button.disabled)), [true, true]);
        const download = await downloading;
        const image = await readFile(await download.path());
        assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(image.readUInt32BE(16), 1280);
        assert.ok(image.length > 10000);
        assert.equal(renderPayload.language, "en");
        assert.ok(renderPayload.customLogo.length > 2 * 1024 * 1024, "local logos above 50 KB must retain their original image data");
        assert.equal(renderPayload.timeZone, "Asia/Shanghai");
        assert.deepEqual(renderPayload.selection.map((entry) => entry.translation), values);
        assert.deepEqual(renderedPage.dates, dates);
        assert.equal(renderedPage.fontSize, "30px");
        assert.match(renderedPage.text, /English translation stays/);
        assert.match(renderedPage.text, /A reply translated independently/);
        await page.waitForFunction(() => [...document.querySelectorAll("#language-switch button")].every((button) => !button.disabled));
        await page.locator("#show-preview-button").click();
        await page.locator(".template-details summary").click();
        const template = '<div class="kept-template">User HTML 保留 {T}</div>';
        await page.locator("#template-input").fill(template);
        await page.locator("#template-name").fill("My template 标记");
        await page.locator("#save-template").click();
        await page.locator("#logo-select option[value^='user:template-']").waitFor({ state: "attached" });
        await language(page, "zh");
        await language(page, "en");
        assert.equal(await page.locator("#template-input").inputValue(), template);
        assert.equal(await page.locator("#template-name").inputValue(), "My template 标记");
        assert.deepEqual(await fields.evaluateAll((nodes) => nodes.map((node) => node.value)), values);
        await page.reload({ waitUntil: "networkidle" });
        try {
          await page.locator("#logo-select option[value^='user:template-']").waitFor({ state: "attached" });
        } catch (error) {
          const diagnostic = await page.evaluate(() => ({
            status: document.querySelector("#status").textContent,
            options: [...document.querySelectorAll("#logo-select option")].map((option) => ({ value: option.value, text: option.textContent })),
            preferences: localStorage.getItem("tweetToaster.preferences.v1")
          }));
          throw new Error(`Local asset restoration failed: ${JSON.stringify(diagnostic)}`, { cause: error });
        }
        assert.equal(await currentLanguage(page), "en");
        assert.equal(await page.locator("#template-input").inputValue(), template);
        assert.equal(await page.locator("#logo-select option[value^='user:logo-']").textContent(), "Original Logo 中文");
        assert.ok(await page.locator("#logo-select option[value='builtin:pekora']").count() > 0);
      } finally { await page.close(); }
    });

    await t.test("English failures and empty states remain usable after switching or resetting", async () => {
      const page = await newPage({ width: 320 });
      try {
        await page.locator("#tweet-url").fill("failure");
        await page.locator("#query-button").click();
        await page.locator("#status.error").waitFor({ state: "visible" });
        assert.match(await page.locator("#status").textContent(), /[a-z]/i);
        assert.doesNotMatch(await page.locator("#status").textContent(), /[\u4e00-\u9fff]/);
        await language(page, "zh");
        assert.match(await page.locator("#status").textContent(), /[\u4e00-\u9fff]/);
        await language(page, "en");
        await page.locator("#tweet-url").fill("minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        await page.locator("#select-none").click();
        assert.equal(await page.locator("#download-button").isDisabled(), true);
        await page.locator("#show-preview-button").click();
        assert.doesNotMatch(await page.locator("#capture").textContent(), /[\u4e00-\u9fff]/);
        await noHorizontalOverflow(page);
        await page.locator("#reset-button").click();
        assert.equal(await page.locator("#tweet-url").inputValue(), "");
        assert.equal(await currentLanguage(page), "en");
        assert.equal(await page.locator("#preview-view-button").isDisabled(), true);
        assert.doesNotMatch(await page.locator("#capture").textContent(), /[\u4e00-\u9fff]/);
      } finally { await page.close(); }
    });

    await t.test("an aborted logo write is not reported as saved and does not disable later template saves", async () => {
      const page = await newPage({ init: () => {
        const put = IDBObjectStore.prototype.put;
        let aborted = false;
        IDBObjectStore.prototype.put = function (record, ...rest) {
          const request = put.call(this, record, ...rest);
          if (record.kind === "logo" && !aborted) {
            aborted = true;
            const transaction = this.transaction;
            request.addEventListener("success", () => transaction.abort());
          }
          return request;
        };
      } });
      try {
        const logo = await readFile(path.resolve("Matsuri_translation/frontend/img/brand-logo.png"));
        await page.locator("#custom-logo").setInputFiles({ name: "Rolled back.png", mimeType: "image/png", buffer: logo });
        await page.locator("#logo-select option[value^='user:logo-']").waitFor({ state: "attached" });
        await page.locator("#status.error").waitFor({ state: "visible" });
        assert.match(await page.locator("#status").textContent(), /session/i);
        await page.locator(".template-details summary").click();
        await page.locator("#template-input").fill("<div>Still saved {T}</div>");
        await page.locator("#template-name").fill("After aborted write");
        await page.locator("#save-template").click();
        await page.locator("#logo-select option[value^='user:template-']").waitFor({ state: "attached" });
        assert.equal(await page.locator("#status.error").count(), 0, await page.locator("#status").textContent());
        await page.reload({ waitUntil: "networkidle" });
        await page.locator("#logo-select option[value^='user:template-']").waitFor({ state: "attached" });
        assert.equal(await page.locator("#template-input").inputValue(), "<div>Still saved {T}</div>");
        assert.equal(await page.locator("#logo-select option[value^='user:logo-']").count(), 0, "rolled-back writes must not survive reload");
      } finally { await page.close(); }
    });

    await t.test("an aborted asset deletion does not disable later template saves", async () => {
      const page = await newPage();
      try {
        const logo = await readFile(path.resolve("Matsuri_translation/frontend/img/brand-logo.png"));
        await page.locator("#custom-logo").setInputFiles({ name: "Kept after abort.png", mimeType: "image/png", buffer: logo });
        await page.locator("#logo-select option[value^='user:logo-']").waitFor({ state: "attached" });
        await page.evaluate(() => {
          const remove = IDBObjectStore.prototype.delete;
          let aborted = false;
          IDBObjectStore.prototype.delete = function (...args) {
            const request = remove.apply(this, args);
            if (!aborted) {
              aborted = true;
              const transaction = this.transaction;
              request.addEventListener("success", () => transaction.abort());
            }
            return request;
          };
        });
        await page.locator("#manage-assets").click();
        page.once("dialog", (dialog) => dialog.accept());
        await page.locator("#my-assets-grid").getByRole("button", { name: "Delete", exact: true }).click();
        await page.locator("#status.error").waitFor({ state: "attached" });
        assert.match(await page.locator("#status").textContent(), /could not delete/i);
        await page.locator("#close-library").click();
        await page.locator(".template-details summary").click();
        await page.locator("#template-input").fill("<div>After delete abort {T}</div>");
        await page.locator("#template-name").fill("Delete recovery");
        await page.locator("#save-template").click();
        await page.locator("#logo-select option[value^='user:template-']").waitFor({ state: "attached" });
        assert.equal(await page.locator("#status.error").count(), 0, await page.locator("#status").textContent());
        await page.reload({ waitUntil: "networkidle" });
        await page.locator("#logo-select option[value^='user:template-']").waitFor({ state: "attached" });
        assert.equal(await page.locator("#template-input").inputValue(), "<div>After delete abort {T}</div>");
        assert.equal(await page.locator("#logo-select option[value^='user:logo-']").count(), 1, "an aborted delete must leave its persisted copy intact");
      } finally { await page.close(); }
    });

    await t.test("session-only uploads still warn after a query has cleared the startup storage warning", async () => {
      const page = await newPage({ init: () => {
        indexedDB.open = () => {
          const request = { error: new DOMException("Storage denied", "SecurityError") };
          queueMicrotask(() => request.onerror?.());
          return request;
        };
      } });
      try {
        await page.locator("#status.error").waitFor({ state: "visible" });
        await page.locator("#tweet-url").fill("minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        assert.equal(await page.locator("#status").isVisible(), false);
        const logo = await readFile(path.resolve("Matsuri_translation/frontend/img/brand-logo.png"));
        await page.locator("#custom-logo").setInputFiles({ name: "Session logo.png", mimeType: "image/png", buffer: logo });
        await page.locator("#logo-select option[value^='user:logo-']").waitFor({ state: "attached" });
        await page.locator("#status.error").waitFor({ state: "visible" });
        assert.match(await page.locator("#status").textContent(), /session/i);
        assert.doesNotMatch(await page.locator("#status").textContent(), /was saved/i);
      } finally { await page.close(); }
    });

    // Chromium can seed the legacy Blob format. WebKit's unreliable Blob
    // writes are exactly why new records use ArrayBuffer; all engines exercise
    // the new format, >2 MB image bytes and reload in the workflow above.
    if (browserType.name() === "chromium") await t.test("existing Blob logos remain readable and migrate losslessly when edited", async () => {
      const page = await newPage();
      try {
        const original = await readFile(path.resolve("Matsuri_translation/frontend/img/brand-logo.png"));
        await page.evaluate(async (bytes) => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open("tweetToasterAssets", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            const transaction = db.transaction("assets", "readwrite");
            transaction.objectStore("assets").put({ id: "legacy-logo", kind: "logo", name: "Legacy logo", blob: new Blob([Uint8Array.from(bytes)], { type: "image/png" }), pinned: true });
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
          });
          db.close();
          const preferences = JSON.parse(localStorage.getItem("tweetToaster.preferences.v1") || "{}");
          localStorage.setItem("tweetToaster.preferences.v1", JSON.stringify({ ...preferences, activeAsset: "user:legacy-logo" }));
        }, [...original]);
        await page.reload({ waitUntil: "networkidle" });
        await page.locator("#logo-select option[value='user:legacy-logo']").waitFor({ state: "attached" });
        assert.equal(await page.locator("#logo-select").inputValue(), "user:legacy-logo");
        await page.locator("#manage-assets").click();
        const card = page.locator("#my-assets-grid .asset-card").filter({ hasText: "Legacy logo" });
        assert.ok(await card.locator("img").evaluate(async (image) => { await image.decode(); return image.naturalWidth > 0; }));
        await card.locator(".pin-button").click();
        await page.waitForFunction(() => document.querySelector("#my-assets-grid .pin-button")?.getAttribute("aria-pressed") === "false");
        const migrated = await page.evaluate(async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open("tweetToasterAssets", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const record = await new Promise((resolve, reject) => {
            const request = db.transaction("assets", "readonly").objectStore("assets").get("legacy-logo");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return { bytes: [...new Uint8Array(record.imageBytes)], mimeType: record.mimeType, hasBlob: "blob" in record };
        });
        assert.equal(migrated.hasBlob, false);
        assert.equal(migrated.mimeType, "image/png");
        assert.deepEqual(Buffer.from(migrated.bytes), original);
      } finally { await page.close(); }
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await jobs.close();
    await renderer.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  }
}
