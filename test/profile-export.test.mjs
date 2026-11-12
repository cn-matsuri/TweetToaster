import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { createTweetToasterServer } from "../src/app.mjs";
import { FxTwitterProvider } from "../src/provider.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { MemorySnapshotStore } from "../src/snapshots.mjs";
import { BotRenderer } from "../src/renderer.mjs";
import { timelinePayload } from "./fixtures.mjs";

const executablePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);

test("recovered profile exports the exact browser preview after the upstream changes, and expiry preserves edits", { timeout: 60000 }, async () => {
  const raw = timelinePayload("elonmusk");
  raw.results.splice(1, 0, {
    ...raw.results[0], id: "2087881201143136470", text: "Unrelated repost must not appear",
    author: { ...raw.results[0].author, name: "Another author", screen_name: "NarutoNolimits" }
  });
  for (const tweet of raw.results) tweet.author.avatar_url = "";
  let upstreamRequests = 0;
  const provider = new FxTwitterProvider({ fetchImpl: async () => {
    upstreamRequests++;
    if (upstreamRequests === 1) return new Response(JSON.stringify({ code: 404 }), { status: 404 });
    if (upstreamRequests === 2) return new Response(JSON.stringify({ code: 200, user: { id: "44196397", screen_name: "elonmusk" } }));
    if (upstreamRequests === 3) return new Response(JSON.stringify(raw));
    throw new Error("upstream changed after the preview was loaded");
  } });
  let elapsed = 0;
  const snapshots = new MemorySnapshotStore({ ttlMs: 1000, now: () => elapsed });
  const jobs = new MemoryJobQueue();
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-profile-export-"));
  let renderer;
  let rendered;
  const server = createTweetToasterServer({
    provider, snapshots, jobs, cacheDir,
    renderBot: (payload, options) => { rendered = payload; return renderer.render(payload, options); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  renderer = new BotRenderer({ origin, cacheDir, executablePath });
  const browserServer = await chromium.launchServer({ headless: true, executablePath, host: "127.0.0.1", timeout: 10000 });
  try {
    const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 10000 });
    const page = await browser.newPage({ viewport: { width: 400, height: 780 }, timezoneId: "Asia/Shanghai", isMobile: true });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.locator("#tweet-url").fill("elonmusk");
    await page.locator("#query-button").click();
    await page.locator("#translation-panel").waitFor({ state: "visible" });
    assert.equal(upstreamRequests, 3);
    assert.equal(await page.locator(".translation-item").count(), 2);
    assert.doesNotMatch(await page.locator("#translation-list").innerText(), /NarutoNolimits|Unrelated repost/);
    await page.locator("#logo-select").selectOption("none");
    await page.locator("#font-size-select").selectOption("30");
    const translations = page.locator("#translation-list textarea");
    await translations.nth(0).fill("第一条不能在下载时消失");
    await translations.nth(1).fill("第二条翻译也要完整保留");
    await page.locator("#show-preview-button").click();
    const previewIds = await page.locator("#capture .tweet-card").evaluateAll((cards) => cards.map((card) => card.dataset.tweetId));
    assert.equal(previewIds.length, 2);
    assert.deepEqual(await page.locator("#capture .tweet-handle").allTextContents(), ["@elonmusk", "@elonmusk"]);
    const previewDates = await page.locator("#capture .tweet-meta").allTextContents();
    await page.evaluate(() => {
      window.saveAs = async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        window.__snapshotPng = { signature: [...bytes.slice(0, 8)], width: new DataView(bytes.buffer).getUint32(16), size: bytes.length };
      };
    });
    await renderer.start();
    let exported;
    const newPage = renderer.browser.newPage.bind(renderer.browser);
    renderer.browser.newPage = async (options) => {
      const renderPage = await newPage(options);
      const close = renderPage.close.bind(renderPage);
      renderPage.close = async () => {
        exported = {
          text: await renderPage.locator("#capture").innerText(),
          ids: await renderPage.locator("#capture .tweet-card").evaluateAll((cards) => cards.map((card) => card.dataset.tweetId)),
          dates: await renderPage.locator("#capture .tweet-meta").allTextContents()
        };
        return close();
      };
      return renderPage;
    };
    const posted = page.waitForRequest((request) => request.url().endsWith("/api/render"));
    await page.locator("#download-button").click();
    assert.match((await posted).postDataJSON().snapshotId, /^[0-9a-f-]{36}$/);
    try {
      // Poll independently of animation frames when several headless Chromium
      // instances run in parallel, and allow the service's 45s job deadline.
      await page.waitForFunction(() => window.__snapshotPng || document.querySelector("#export-status").classList.contains("error"), null, { polling: 100, timeout: 50000 });
    } catch (error) {
      // Diagnostics must not wait on a potentially unresponsive test browser.
      throw new Error(JSON.stringify({ pageErrors, jobs: [...jobs.jobs.values()] }), { cause: error });
    }
    const result = await page.evaluate(() => ({ png: window.__snapshotPng, error: document.querySelector("#export-status").textContent }));
    assert.ok(result.png, result.error);
    assert.deepEqual(result.png.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(result.png.width, 1280);
    assert.ok(result.png.size > 10000);
    assert.deepEqual(exported.ids, previewIds);
    assert.deepEqual(exported.dates, previewDates);
    assert.match(exported.text, /第一条不能在下载时消失/);
    assert.match(exported.text, /第二条翻译也要完整保留/);
    assert.doesNotMatch(exported.text, /NarutoNolimits|Unrelated repost/);
    assert.equal(rendered.fontSize, 30);
    assert.equal(rendered.timeZone, "Asia/Shanghai");
    assert.equal(upstreamRequests, 3, "downloading must not fetch the moving timeline again");

    elapsed = 1000;
    await page.locator("#download-button").click();
    await page.locator("#export-status.error").waitFor({ state: "visible" });
    assert.match(await page.locator("#export-status").innerText(), /过期/);
    await page.waitForFunction(() => !document.querySelector("#download-button").disabled);
    await page.locator("#show-preview-button").click();
    assert.equal(await translations.nth(0).inputValue(), "第一条不能在下载时消失");
    assert.equal(await translations.nth(1).inputValue(), "第二条翻译也要完整保留");
    assert.equal(upstreamRequests, 3);
    assert.deepEqual(pageErrors, []);
  } finally {
    // This test owns the process. Reap it even when a local Chromium hangs, so
    // a failed browser assertion cannot leave the test runner stuck in close().
    await browserServer.kill();
    await Promise.all([jobs.close(), renderer.close()]);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  }
});
