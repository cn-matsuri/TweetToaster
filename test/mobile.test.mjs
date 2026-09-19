import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

async function assertNoHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(geometry.document <= geometry.viewport + 1, JSON.stringify(geometry));
  assert.ok(geometry.body <= geometry.viewport + 1, JSON.stringify(geometry));
}

async function assertFittedPreview(page) {
  await page.waitForFunction(() => {
    const capture = document.querySelector("#capture").getBoundingClientRect();
    const frame = document.querySelector("#capture-frame").getBoundingClientRect();
    return capture.width > 0 && capture.width <= document.documentElement.clientWidth &&
      capture.width <= frame.width + 1 && Math.abs(frame.height - capture.height) < 2;
  });
  const geometry = await page.locator("#capture").evaluate((capture) => ({
    layoutWidth: capture.offsetWidth,
    displayedWidth: capture.getBoundingClientRect().width,
    frameWidth: document.querySelector("#capture-frame").getBoundingClientRect().width,
    viewportWidth: document.documentElement.clientWidth
  }));
  assert.equal(geometry.layoutWidth, 640, "mobile fitting must not reflow the exported card");
  assert.ok(geometry.displayedWidth <= geometry.frameWidth + 1, JSON.stringify(geometry));
  assert.ok(geometry.displayedWidth <= geometry.viewportWidth, JSON.stringify(geometry));
  await assertNoHorizontalOverflow(page);
}

test("mobile homepage, editing and real PNG export remain usable across viewports", { timeout: 120000 }, async (t) => {
  const data = normalizedConversation();
  data.tweets[0].createdAt = "2026-01-01T20:16:00Z";
  data.tweets[1].createdAt = "2026-01-01T21:16:00Z";
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-mobile-"));
  let renderer;
  let exportedPayload;
  let exportedPage;
  let releasePendingQuery;
  let notifyPendingQuery;
  const pendingQueryStarted = new Promise((resolve) => { notifyPendingQuery = resolve; });
  const server = createTweetToasterServer({
    provider: {
      fetchTweet: async (input) => {
        if (input === "failure") throw Object.assign(new Error("测试数据源暂时不可用，请重试"), { status: 400 });
        if (input === "long-conversation") {
          const conversation = structuredClone(data);
          const reply = conversation.tweets[1];
          conversation.tweets = [conversation.tweets[0], ...Array.from({ length: 25 }, (_, index) => ({
            ...structuredClone(reply),
            id: String(BigInt(reply.id) + BigInt(index)),
            text: index % 3 === 0
              ? `https://example.com/${"UnbrokenPublicLinkSegment".repeat(8)}\n第 ${index + 1} 条回复。`
              : `第 ${index + 1} 条公开回复。\n这里保留完整上下文，用户应当能翻译任何一条回复。\n长列表不应该阻挡底部的预览和下载按钮。`,
            author: {
              ...reply.author,
              screenName: `fan_account_${String(index + 1).padStart(2, "0")}`,
              name: index % 2 === 0 ? "LongUnbrokenFanDisplayNameWithoutAnySpaces" : "星読み☄️フブみこめっとさんを一生推していきます🫶"
            }
          }))];
          return conversation;
        }
        if (input === "delayed") {
          await new Promise((resolve) => {
            releasePendingQuery = resolve;
            notifyPendingQuery();
          });
          const staleData = structuredClone(data);
          staleData.tweets[0].text = "这条已取消的旧查询不应该重新出现在编辑器里";
          return staleData;
        }
        return structuredClone(data);
      }
    },
    jobs: new MemoryJobQueue(),
    renderBot: (payload) => {
      exportedPayload = payload;
      return renderer.render(payload);
    },
    cacheDir
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  renderer = new BotRenderer({ origin, cacheDir, executablePath: chromePath });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const pageErrors = [];
  const newPage = async (width = 400, height = 662) => {
    const page = await browser.newPage({ viewport: { width, height }, timezoneId: "Asia/Shanghai", isMobile: true, hasTouch: true });
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.locator("#logo-select option").first().waitFor({ state: "attached" });
    return page;
  };
  try {
    for (const width of [320, 375, 400, 768]) {
      await t.test(`first visit exposes the query without overlays at ${width}px`, async () => {
        const page = await newPage(width);
        try {
          const input = page.locator("#tweet-url");
          assert.equal(await page.locator("body").getAttribute("data-view"), "edit");
          assert.equal(await input.isVisible(), true);
          const inputBounds = await input.boundingBox();
          assert.ok(inputBounds.y >= 0 && inputBounds.y + inputBounds.height <= 662, "the query input must be above the fold");
          const queryBounds = await page.locator("#query-button").boundingBox();
          assert.ok(queryBounds.y >= 0 && queryBounds.y + queryBounds.height <= 662, "the query action must be above the fold");
          assert.equal(await page.locator("#preview-view-button").isDisabled(), true);
          assert.equal(await page.locator("#edit-view-button").getAttribute("aria-selected"), "true");
          assert.equal(await page.locator("#preview-view-button").getAttribute("aria-selected"), "false");
          assert.equal(await page.locator("#edit-view-button").getAttribute("role"), "tab");
          assert.equal(await page.locator("#edit-view-button").getAttribute("aria-controls"), "editor-view");
          assert.equal(await page.locator("#preview-view-button").getAttribute("aria-controls"), "preview-pane");
          await page.locator("#edit-view-button").press("End");
          assert.equal(await page.locator("body").getAttribute("data-view"), "edit", "keyboard navigation cannot open an empty preview");
          assert.equal(await page.locator("#style-panel").isVisible(), true);
          await assertNoHorizontalOverflow(page);

          await page.locator("#manage-assets").click();
          await page.locator("#asset-library").waitFor({ state: "visible" });
          const libraryBounds = await page.locator("#asset-library").boundingBox();
          assert.ok(libraryBounds.x >= 0 && libraryBounds.x + libraryBounds.width <= width + 1, "the template library must fit the phone");
          await page.locator("#asset-search").fill("兔田");
          assert.ok(await page.locator("#builtin-assets-grid .asset-card").count() > 0);
          await page.locator("#close-library").click();
          assert.equal(await page.locator("#asset-library").isVisible(), false);
          await assertNoHorizontalOverflow(page);
        } finally {
          await page.close();
        }
      });
    }

    for (const width of [320, 400]) {
      await t.test(`fixed actions remain clickable after scrolling through many replies at ${width}px`, async () => {
        const page = await newPage(width, 780);
        try {
          await page.locator("#tweet-url").fill("long-conversation");
          await page.locator("#query-button").click();
          await page.locator("#translation-panel").waitFor({ state: "visible" });
          assert.equal(await page.locator(".translation-item").count(), 26);
          await assertNoHorizontalOverflow(page);
          const viewport = await page.evaluate(() => ({
            layoutWidth: innerWidth,
            layoutHeight: innerHeight,
            visualWidth: visualViewport.width,
            visualHeight: visualViewport.height
          }));
          assert.deepEqual(viewport, { layoutWidth: width, layoutHeight: 780, visualWidth: width, visualHeight: 780 }, "long content must not auto-expand the mobile layout viewport");
          await page.getByPlaceholder("输入中文翻译（留空则只显示原文）").first().fill("长回复列表中的目标推文翻译。");
          await page.locator("#font-size-select").scrollIntoViewIfNeeded();
          await page.locator("#font-size-select").selectOption("30");
          assert.ok(await page.evaluate(() => window.scrollY > 2000), "the appearance controls must be reached through the long editor");
          await assertNoHorizontalOverflow(page);
          try {
            // A real, unforced pointer action must hit the fixed footer, not a reply behind it.
            await page.locator("#show-preview-button").click();
          } catch (error) {
            const geometry = await page.locator("#show-preview-button").evaluate((button) => {
              const bounds = button.getBoundingClientRect();
              const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
              return {
                scrollY: window.scrollY,
                innerHeight: window.innerHeight,
                visualViewport: { height: visualViewport.height, offsetTop: visualViewport.offsetTop, pageTop: visualViewport.pageTop, scale: visualViewport.scale },
                button: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
                hit: hit?.outerHTML.slice(0, 300)
              };
            });
            error.message += `\nMobile hit-test geometry: ${JSON.stringify(geometry)}`;
            throw error;
          }
          assert.equal(await page.locator("body").getAttribute("data-view"), "preview");
          await assertFittedPreview(page);
          await page.locator("#show-preview-button").click();
          assert.equal(await page.locator("body").getAttribute("data-view"), "edit");
          assert.equal(await page.getByPlaceholder("输入中文翻译（留空则只显示原文）").first().inputValue(), "长回复列表中的目标推文翻译。");
          await page.locator("#show-preview-button").click();
          assert.equal(await page.locator("body").getAttribute("data-view"), "preview");
        } finally {
          await page.close();
        }
      });
    }

    await t.test("reply edits, long preview, orientation changes and download preserve card contents", async () => {
      const page = await newPage();
      try {
        await page.locator("#tweet-url").fill("x.com/minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        assert.equal(await page.locator("body").getAttribute("data-view"), "edit");
        assert.equal(await page.locator("#preview-view-button").isDisabled(), false);
        const translation = "翻译内容需要一直保留。\n".repeat(20).trim();
        const fields = page.getByPlaceholder("输入中文翻译（留空则只显示原文）");
        await fields.first().fill(translation);
        await page.getByLabel("包含 @fan 的第 2 条推文").check();
        await fields.nth(1).fill("回复也要保留，不受切换页面影响。");
        await page.locator("#logo-select").selectOption("none");
        await page.locator("#font-size-select").selectOption("30");
        await page.locator("#show-preview-button").click();
        assert.equal(await page.locator("body").getAttribute("data-view"), "preview");
        assert.equal(await page.locator("#preview-view-button").getAttribute("aria-selected"), "true");
        assert.equal(await page.locator("#edit-view-button").getAttribute("aria-selected"), "false");
        assert.equal(await page.locator("#editor-view").isVisible(), false);
        assert.equal(await page.locator("#preview-pane").isVisible(), true);
        assert.match(await page.locator("#capture").innerText(), /回复也要保留/);
        assert.equal(await page.locator("#capture .translation-text").first().evaluate((node) => getComputedStyle(node).fontSize), "30px");
        assert.deepEqual(await page.locator("#capture .tweet-meta").allTextContents(), ["2026年1月2日 04:16", "2026年1月2日 05:16"]);
        await assertFittedPreview(page);

        for (const [width, height] of [[320, 662], [768, 400], [400, 662]]) {
          await page.setViewportSize({ width, height });
          await assertFittedPreview(page);
        }

        await page.locator("#edit-view-button").click();
        assert.equal(await fields.first().inputValue(), translation);
        assert.equal(await fields.nth(1).inputValue(), "回复也要保留，不受切换页面影响。");
        assert.equal(await page.getByLabel("包含 @fan 的第 2 条推文").isChecked(), true);
        await fields.first().fill("短一点也不能留下长图的空白。");
        await page.locator("#preview-view-button").click();
        await assertFittedPreview(page);

        await renderer.start();
        const newRenderPage = renderer.browser.newPage.bind(renderer.browser);
        renderer.browser.newPage = async (options) => {
          // The render viewport is narrower than the desktop breakpoint, just like production.
          const renderPage = await newRenderPage({ ...options, timezoneId: "UTC" });
          const close = renderPage.close.bind(renderPage);
          renderPage.close = async () => {
            exportedPage = {
              dates: await renderPage.locator("#capture .tweet-meta").allTextContents(),
              fontSize: await renderPage.locator("#capture .translation-text").first().evaluate((node) => getComputedStyle(node).fontSize),
              width: await renderPage.locator("#capture").evaluate((node) => node.getBoundingClientRect().width)
            };
            return close();
          };
          return renderPage;
        };
        await page.evaluate(() => {
          window.__mobilePng = null;
          window.saveAs = async (blob) => {
            const bytes = new DataView(await blob.arrayBuffer());
            window.__mobilePng = { size: blob.size, width: bytes.getUint32(16) };
          };
        });
        assert.equal(await page.locator("#download-button").count(), 1, "editing and preview share one download action");
        await page.locator("#download-button").click();
        await page.waitForFunction(() => window.__mobilePng || document.querySelector("#status")?.classList.contains("error"), null, { timeout: 45000 });
        const outcome = await page.evaluate(() => ({ png: window.__mobilePng, status: document.querySelector("#status").textContent }));
        assert.ok(outcome.png, outcome.status);
        assert.equal(outcome.png.width, 1280);
        assert.ok(outcome.png.size > 10000);
        assert.equal(exportedPayload.timeZone, "Asia/Shanghai");
        assert.equal(exportedPayload.fontSize, 30);
        assert.equal(exportedPayload.selection.length, 2);
        assert.deepEqual(exportedPage.dates, ["2026年1月2日 04:16", "2026年1月2日 05:16"]);
        assert.equal(exportedPage.fontSize, "30px");
        assert.equal(exportedPage.width, 640);

        await page.locator("#reset-button").click();
        assert.equal(await page.locator("body").getAttribute("data-view"), "edit");
        assert.equal(await page.locator("#tweet-url").inputValue(), "");
        assert.equal(await page.locator("#translation-panel").isVisible(), false);
        assert.equal(await page.locator("#preview-view-button").isDisabled(), true);
        assert.equal(await page.locator("#font-size-select").inputValue(), "30", "reset should preserve the user's appearance preferences");
        await assertNoHorizontalOverflow(page);
      } finally {
        await page.close();
      }
    });

    await t.test("query and export failures remain actionable, keyboard tabs work and desktop exposes both panes", async () => {
      const page = await newPage();
      try {
        await page.locator("#tweet-url").fill("failure");
        await page.locator("#query-button").click();
        await page.locator("#status.error").waitFor({ state: "visible" });
        assert.match(await page.locator("#status").innerText(), /数据源暂时不可用/);
        assert.equal(await page.locator("#query-button").isEnabled(), true);
        assert.equal(await page.locator("#preview-view-button").isDisabled(), true);
        await page.locator("#tweet-url").fill("@minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        assert.equal(await page.locator("#status").isVisible(), false);
        await page.locator("#select-none").click();
        assert.equal(await page.locator("#download-button").isDisabled(), true, "empty selections cannot create an empty PNG");
        await page.locator("#select-all").click();
        assert.equal(await page.locator("#download-button").isEnabled(), true);
        await page.locator("#edit-view-button").press("ArrowRight");
        assert.equal(await page.locator("body").getAttribute("data-view"), "preview");
        assert.equal(await page.locator("#preview-view-button").evaluate((node) => node === document.activeElement), true);
        await page.locator("#preview-view-button").press("Home");
        assert.equal(await page.locator("body").getAttribute("data-view"), "edit");
        await page.locator("#edit-view-button").press("End");
        assert.equal(await page.locator("body").getAttribute("data-view"), "preview");

        await page.route("**/api/render", (route) => route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "测试出图服务暂时不可用" } })
        }));
        await page.locator("#download-button").click();
        await page.locator("#export-status.error").waitFor({ state: "visible" });
        assert.match(await page.locator("#export-status").innerText(), /测试出图服务暂时不可用/);
        assert.equal(await page.locator("#download-button").isEnabled(), true, "a failed export can be retried");
        const retryBounds = await page.locator("#download-button").boundingBox();
        assert.ok(retryBounds.y >= 0 && retryBounds.y + retryBounds.height <= 662, "the retry action remains in the visible footer");
        await assertNoHorizontalOverflow(page);
        await page.unroute("**/api/render");
        await page.locator("#edit-view-button").click();
        await page.locator("#tweet-url").fill("minatoaqua");
        await Promise.all([
          page.waitForResponse((response) => response.url().endsWith("/api/tweet") && response.status() === 200),
          page.locator("#query-button").click()
        ]);
        await page.waitForFunction(() => !document.querySelector("#tweet-form").hasAttribute("aria-busy"));
        assert.equal(await page.locator("#status").isVisible(), false);
        assert.equal(await page.locator("#export-status").isVisible(), false, "a successful new query clears the previous export error");
        assert.equal(await page.locator("#export-status").innerText(), "");
        await page.locator("#preview-view-button").click();
        await page.setViewportSize({ width: 1280, height: 800 });
        assert.equal(await page.locator("#editor-view").isVisible(), true);
        assert.equal(await page.locator("#preview-pane").isVisible(), true);
        await assertFittedPreview(page);
      } finally {
        await page.close();
      }
    });

    await t.test("reset aborts an in-flight query and prevents stale content from returning", async () => {
      const page = await newPage();
      try {
        await page.locator("#tweet-url").fill("minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        await page.locator("#tweet-url").fill("delayed");
        await page.locator("#query-button").click();
        await pendingQueryStarted;
        assert.equal(await page.locator("#query-button").isDisabled(), true);
        const abortedRequest = page.waitForEvent("requestfailed", {
          predicate: (request) => request.url().endsWith("/api/tweet") && request.postDataJSON()?.url === "delayed"
        });
        await page.locator("#reset-button").click();
        await abortedRequest;
        releasePendingQuery();
        assert.equal(await page.locator("#tweet-url").inputValue(), "");
        assert.equal(await page.locator("#query-button").isEnabled(), true);
        assert.equal(await page.locator("#translation-panel").isVisible(), false);
        assert.equal(await page.locator("#preview-view-button").isDisabled(), true);
        assert.equal(await page.locator("#status").isVisible(), false);

        await page.locator("#tweet-url").fill("@minatoaqua");
        await page.locator("#query-button").click();
        await page.locator("#translation-panel").waitFor({ state: "visible" });
        assert.doesNotMatch(await page.locator("#translation-list").innerText(), /这条已取消的旧查询/);
        assert.equal(await page.locator("#query-button").isEnabled(), true);
      } finally {
        releasePendingQuery?.();
        await page.close();
      }
    });
    assert.deepEqual(pageErrors, [], "mobile interactions must not throw uncaught browser errors");
  } finally {
    await browser.close();
    await renderer.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  }
});
