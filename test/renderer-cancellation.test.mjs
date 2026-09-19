import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { BotRenderer } from "../src/renderer.mjs";

const chromePath = process.env.CHROMIUM_PATH || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : undefined);
const timeout = { timeout: 30000 };

// Exercise real browser operations, including a page that never resolves its
// render promise. No provider, external network, font or image timing is needed.
const fixtureHtml = `<!doctype html><html><body>
<div id="capture" style="width:640px;height:120px;background:white">PNG fixture</div>
<script>
window.TweetToaster = { async renderForBot(data) {
  if (data.stall === "evaluate") {
    console.log("entered-evaluate");
    if (data.busy) while (true) {} // Simulate a Chromium renderer that cannot process page-close commands.
    await new Promise(() => {});
  }
  document.getElementById("capture").textContent = data.text || "healthy render";
  window.__tweetToasterReady = true;
} };
</script></body></html>`;

function outcome(promise) {
  return promise.then((result) => ({ result }), (error) => ({ error }));
}

function assertExited(child) {
  assert.ok(child.exitCode !== null || child.signalCode !== null, `owned Chromium ${child.pid} must have exited`);
}

async function fixture(t, options = {}) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-render-cancel-"));
  const state = { stallNavigation: false, navigations: 0, enteredNavigation: Promise.withResolvers() };
  const server = http.createServer((request, response) => {
    if (request.url === "/?render=1") {
      state.navigations++;
      state.enteredNavigation.resolve();
      if (state.stallNavigation) return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fixtureHtml);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const renderer = new BotRenderer({
    origin: `http://127.0.0.1:${server.address().port}`,
    cacheDir,
    executablePath: chromePath,
    ...options
  });
  t.after(async () => {
    state.beforeClose?.();
    await renderer.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  });
  return { renderer, cacheDir, state };
}

async function observeEvaluation(renderer) {
  await renderer.start();
  const entered = Promise.withResolvers();
  const newPage = renderer.browser.newPage.bind(renderer.browser);
  renderer.browser.newPage = async (options) => {
    const page = await newPage(options);
    page.on("console", (message) => {
      if (message.text() === "entered-evaluate") entered.resolve();
    });
    return page;
  };
  return { entered: entered.promise };
}

async function assertPng(cacheDir, filename) {
  const png = await readFile(path.join(cacheDir, `${filename}.png`));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1280);
}

async function waitFor(check) {
  const deadline = Date.now() + 10000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "condition did not become true before the test deadline");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("a pre-aborted render does not start Chromium", timeout, async (t) => {
  const { renderer, state } = await fixture(t);
  const reason = new Error("cancel before admission");
  await assert.rejects(renderer.render({}, { signal: AbortSignal.abort(reason) }), (error) => error === reason);
  assert.equal(renderer.browserServer, null);
  assert.equal(state.navigations, 0);
});

test("the bounded renderer removes cancelled waiters, kills active work and recovers to a real PNG", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t, { maxPending: 1 });
  const { entered } = await observeEvaluation(renderer);
  const oldProcess = renderer.browserServer.process();
  const activeController = new AbortController();
  const active = outcome(renderer.render({ stall: "evaluate", busy: true }, { signal: activeController.signal }));
  await entered;
  const waitingController = new AbortController();
  const waiting = outcome(renderer.render({ text: "must not render" }, { signal: waitingController.signal }));
  await assert.rejects(renderer.render({}), { code: "QUEUE_FULL" });
  const waitingReason = new Error("cancel waiter");
  waitingController.abort(waitingReason);
  assert.equal((await waiting).error, waitingReason);
  // Removing a waiter really frees its queue slot, without releasing the active one.
  const healthy = renderer.render({ text: "recovered after cancellation" });
  const activeReason = new Error("cancel stuck evaluation");
  activeController.abort(activeReason);
  assert.equal((await active).error, activeReason);
  assertExited(oldProcess);
  const filename = await healthy;
  await assertPng(cacheDir, filename);
  assert.equal(state.navigations, 2, "the cancelled waiter must never navigate later");
  assert.deepEqual(await readdir(cacheDir), [`${filename}.png`]);
  const newProcess = renderer.browserServer.process();
  assert.notEqual(newProcess.pid, oldProcess.pid);
  await renderer.close();
  assertExited(newProcess);
});

test("abort cancels a real stalled navigation before allowing the next render", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t);
  await renderer.start();
  const oldProcess = renderer.browserServer.process();
  state.stallNavigation = true;
  const controller = new AbortController();
  const active = outcome(renderer.render({}, { signal: controller.signal }));
  await state.enteredNavigation.promise;
  const reason = new Error("navigation expired");
  controller.abort(reason);
  assert.equal((await active).error, reason);
  assertExited(oldProcess);
  assert.deepEqual(await readdir(cacheDir), []);
  state.stallNavigation = false;
  await assertPng(cacheDir, await renderer.render({ text: "navigation recovered" }));
  assert.equal(state.navigations, 2);
});

test("abort racing with startup waits for and reaps the eventual browser process", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t);
  const launched = Promise.withResolvers();
  const release = Promise.withResolvers();
  const originalLaunch = chromium.launchServer.bind(chromium);
  const mock = t.mock.method(chromium, "launchServer", async (options) => {
    const server = await originalLaunch(options);
    launched.resolve(server);
    await release.promise;
    return server;
  });
  state.beforeClose = () => release.resolve();
  const controller = new AbortController();
  let settled = false;
  const active = outcome(renderer.render({}, { signal: controller.signal })).then((result) => {
    settled = true;
    return result;
  });
  const server = await launched.promise;
  const child = server.process();
  const reason = new Error("cancel while launch is resolving");
  controller.abort(reason);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "do not declare startup cancelled while its browser is still alive");
  release.resolve();
  assert.equal((await active).error, reason);
  assertExited(child);
  assert.equal(renderer.browser, null);
  assert.equal(state.navigations, 0);
  mock.mock.restore();
  await assertPng(cacheDir, await renderer.render({}));
});

test("cancellation waits for screenshot settlement and removes its already-written artifact", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t);
  await renderer.start();
  const child = renderer.browserServer.process();
  const wroteScreenshot = Promise.withResolvers();
  const releaseScreenshot = Promise.withResolvers();
  state.beforeClose = () => releaseScreenshot.resolve();
  const newPage = renderer.browser.newPage.bind(renderer.browser);
  renderer.browser.newPage = async (options) => {
    const page = await newPage(options);
    const locator = page.locator.bind(page);
    page.locator = (...args) => {
      const element = locator(...args);
      const screenshot = element.screenshot.bind(element);
      element.screenshot = async (options) => {
        const buffer = await screenshot(options);
        wroteScreenshot.resolve(options.path);
        await releaseScreenshot.promise;
        return buffer;
      };
      return element;
    };
    return page;
  };
  const controller = new AbortController();
  let settled = false;
  const active = outcome(renderer.render({}, { signal: controller.signal })).then((result) => {
    settled = true;
    return result;
  });
  await wroteScreenshot.promise;
  assert.equal((await readdir(cacheDir)).length, 1);
  const healthy = renderer.render({ text: "after artifact cleanup" });
  const exited = once(child, "exit");
  const reason = new Error("cancel during PNG write");
  controller.abort(reason);
  await exited;
  assert.equal(settled, false, "process exit alone cannot release an unfinished screenshot operation");
  assert.equal(state.navigations, 1);
  releaseScreenshot.resolve();
  assert.equal((await active).error, reason);
  const filename = await healthy;
  await assertPng(cacheDir, filename);
  assert.deepEqual(await readdir(cacheDir), [`${filename}.png`]);
});

test("direct renderer users also get an enforced deadline and real process cleanup", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t, { timeoutMs: 500 });
  await renderer.start();
  const child = renderer.browserServer.process();
  state.stallNavigation = true;
  await assert.rejects(renderer.render({}), { code: "RENDER_TIMEOUT", status: 504 });
  assertExited(child);
  assert.deepEqual(await readdir(cacheDir), []);
});

test("shutdown cancels active work and waiters and never starts queued pages afterward", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t);
  const { entered } = await observeEvaluation(renderer);
  const child = renderer.browserServer.process();
  const active = outcome(renderer.render({ stall: "evaluate" }));
  await entered;
  const waiting = outcome(renderer.render({ text: "must not start during shutdown" }));
  await renderer.close();
  assert.equal((await active).error.code, "RENDERER_CLOSED");
  assert.equal((await waiting).error.code, "RENDERER_CLOSED");
  assertExited(child);
  assert.equal(state.navigations, 1);
  assert.deepEqual(await readdir(cacheDir), []);
  await assert.rejects(renderer.render({}), { code: "RENDERER_CLOSED" });
  await assert.rejects(renderer.start(), { code: "RENDERER_CLOSED" });
});

test("a delayed deadline callback cannot publish a late PNG as successful", timeout, async (t) => {
  const { renderer, cacheDir } = await fixture(t);
  await renderer.start();
  const child = renderer.browserServer.process();
  const realNow = performance.now.bind(performance);
  let offset = 0;
  t.mock.method(performance, "now", () => realNow() + offset);
  const newPage = renderer.browser.newPage.bind(renderer.browser);
  renderer.browser.newPage = async (options) => {
    const page = await newPage(options);
    const close = page.close.bind(page);
    page.close = async () => {
      await close();
      // Simulate a busy event loop delivering the completed work before the
      // admission timer callback; no real 45-second delay is necessary.
      offset = 45001;
    };
    return page;
  };
  await assert.rejects(renderer.render({}), { code: "RENDER_TIMEOUT" });
  assertExited(child);
  assert.deepEqual(await readdir(cacheDir), []);
});

test("job deadlines cancel real Chromium and hold admission until renderer cleanup is complete", timeout, async (t) => {
  const { renderer, cacheDir, state } = await fixture(t);
  const { entered } = await observeEvaluation(renderer);
  const browserServer = renderer.browserServer;
  const child = browserServer.process();
  const killed = Promise.withResolvers();
  const releaseCleanup = Promise.withResolvers();
  state.beforeClose = () => releaseCleanup.resolve();
  const kill = browserServer.kill.bind(browserServer);
  t.mock.method(browserServer, "kill", async () => {
    await kill();
    killed.resolve();
    await releaseCleanup.promise;
  });
  const jobs = new MemoryJobQueue({ maxActive: 1, jobTimeoutMs: 2500 });
  t.after(() => jobs.close());
  const id = jobs.add(({ signal }) => renderer.render({ stall: "evaluate", busy: true }, { signal }));
  await entered;
  await killed.promise;
  assert.equal(jobs.get(id).state, "FAILURE");
  assert.equal(jobs.get(id).code, "JOB_TIMEOUT");
  assert.equal(jobs.active.size, 1, "public failure must not hide cleanup still holding the worker slot");
  assert.throws(() => jobs.add(() => renderer.render({})), { code: "QUEUE_FULL" });
  assertExited(child);
  releaseCleanup.resolve();
  await waitFor(() => jobs.active.size === 0);
  const retryId = jobs.add(({ signal }) => renderer.render({ text: "healthy after the failed job" }, { signal }));
  await waitFor(() => jobs.get(retryId).state !== "PENDING" && jobs.get(retryId).state !== "STARTED");
  const retry = jobs.get(retryId);
  assert.equal(retry.state, "SUCCESS", retry.error);
  await assertPng(cacheDir, retry.result);
  assert.equal(jobs.get(id).state, "FAILURE", "cleanup must not overwrite the original deadline failure");
  assert.equal(jobs.get(id).code, "JOB_TIMEOUT");
  assert.deepEqual(await readdir(cacheDir), [`${retry.result}.png`]);
});
