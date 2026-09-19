import { access, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

async function firstExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function rendererError(message, code, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

export class BotRenderer {
  #pending = [];
  #active = null;
  #starting = null;
  #resource = null;
  #closed = false;

  constructor({ origin, cacheDir, executablePath = process.env.CHROMIUM_PATH, maxPending = 50, timeoutMs = 45000 } = {}) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 0) throw new TypeError("maxPending must be a non-negative safe integer");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
      throw new TypeError("timeoutMs must be a positive 32-bit integer");
    }
    this.origin = origin;
    this.cacheDir = cacheDir;
    this.executablePath = executablePath;
    this.maxPending = maxPending;
    this.timeoutMs = timeoutMs;
    this.browser = null;
    this.browserServer = null;
  }

  async start() {
    if (this.#closed) throw rendererError("图片渲染服务已关闭", "RENDERER_CLOSED");
    if (this.#starting) return this.#starting;
    if (this.browser?.isConnected()) return;
    const starting = this.#launch();
    this.#starting = starting;
    try {
      await starting;
    } finally {
      if (this.#starting === starting) this.#starting = null;
    }
  }

  async #launch() {
    // Reap a disconnected browser before replacing it, if it did not exit cleanly.
    if (this.#resource) await this.#dispose(this.#resource, true);
    await mkdir(this.cacheDir, { recursive: true });
    const executablePath = await firstExecutable([
      this.executablePath,
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      ...MAC_BROWSERS
    ]);
    this.#checkStartup();
    // Own the process through Playwright's public API so cancellation can kill an
    // unresponsive Chromium, not merely stop waiting on a promise or websocket.
    const server = await chromium.launchServer({
      host: "127.0.0.1",
      headless: true,
      executablePath,
      timeout: 10000,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
    const resource = { server, browser: null, disposal: null };
    this.#resource = resource;
    this.browserServer = server;
    try {
      this.#checkStartup();
      resource.browser = await chromium.connect(server.wsEndpoint(), { timeout: 10000 });
      this.#checkStartup();
      this.browser = resource.browser;
    } catch (error) {
      await this.#dispose(resource, true);
      throw error;
    }
  }

  #checkStartup() {
    if (this.#closed) throw rendererError("图片渲染服务已关闭", "RENDERER_CLOSED");
    if (this.#active) this.#checkDeadline(this.#active);
  }

  #checkDeadline(entry) {
    if (!entry.controller.signal.aborted && performance.now() >= entry.deadlineAt) {
      entry.controller.abort(rendererError("图片渲染超时，请稍后重试", "RENDER_TIMEOUT", 504));
    }
    entry.controller.signal.throwIfAborted();
  }

  render(payload, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.#closed) return Promise.reject(rendererError("图片渲染服务已关闭", "RENDERER_CLOSED"));
    if (this.#active && this.#pending.length >= this.maxPending) {
      return Promise.reject(rendererError("图片渲染队列已满，请稍后重试", "QUEUE_FULL"));
    }
    const controller = new AbortController();
    const entry = { payload, controller, signal, deadlineAt: performance.now() + this.timeoutMs, output: null, cancellation: null };
    const result = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
    entry.forwardAbort = () => controller.abort(signal.reason);
    entry.onAbort = () => {
      if (this.#active === entry) {
        // Do not release the active slot until the owned process has exited AND
        // the render operation (including an in-progress screenshot) has settled.
        entry.cancellation ??= this.#terminate().then(() => null, (error) => {
          this.#closed = true;
          this.#abortPending(error);
          return error;
        });
      } else {
        const index = this.#pending.indexOf(entry);
        if (index !== -1) this.#pending.splice(index, 1);
        this.#settle(entry, controller.signal.reason);
      }
    };
    controller.signal.addEventListener("abort", entry.onAbort, { once: true });
    signal?.addEventListener("abort", entry.forwardAbort, { once: true });
    entry.timer = setTimeout(() => {
      controller.abort(rendererError("图片渲染超时，请稍后重试", "RENDER_TIMEOUT", 504));
    }, this.timeoutMs);
    entry.timer.unref();
    this.#pending.push(entry);
    this.#drain();
    return result;
  }

  #settle(entry, error, result) {
    clearTimeout(entry.timer);
    entry.signal?.removeEventListener("abort", entry.forwardAbort);
    entry.controller.signal.removeEventListener("abort", entry.onAbort);
    entry.payload = null;
    if (entry.controller.signal.aborted || error !== undefined) entry.reject(error);
    else entry.resolve(result);
  }

  #drain() {
    while (!this.#closed && !this.#active && this.#pending.length) {
      const entry = this.#pending[0];
      try {
        // Timers may be delayed by a busy event loop. Expired waiters still must
        // never start Chromium or turn a late result into a successful render.
        this.#checkDeadline(entry);
      } catch {
        continue; // The abort listener has removed and rejected this waiter.
      }
      this.#pending.shift();
      this.#active = entry;
      entry.task = this.#execute(entry);
    }
  }

  async #execute(entry) {
    let result;
    let error;
    try {
      this.#checkDeadline(entry);
      result = await this.#renderWithRetry(entry);
      this.#checkDeadline(entry);
    } catch (caught) {
      error = entry.controller.signal.aborted ? entry.controller.signal.reason : caught;
    } finally {
      if ((error !== undefined || entry.controller.signal.aborted) && entry.output) await unlink(entry.output).catch(() => {});
      if (entry.cancellation) {
        const cleanupError = await entry.cancellation;
        if (cleanupError) error = cleanupError;
      }
      if (entry.controller.signal.aborted) error = entry.controller.signal.reason;
      this.#active = null;
      this.#settle(entry, error, result);
      this.#drain();
    }
  }

  async #renderWithRetry(entry) {
    try {
      return await this.#render(entry);
    } catch (firstError) {
      this.#checkDeadline(entry);
      if (entry.output) await unlink(entry.output).catch(() => {});
      entry.output = null;
      await this.#terminate();
      this.#checkDeadline(entry);
      try {
        return await this.#render(entry);
      } catch (secondError) {
        this.#checkDeadline(entry);
        if (secondError instanceof Error) secondError.cause = firstError;
        throw secondError;
      }
    }
  }

  async #render(entry) {
    const { signal } = entry.controller;
    this.#checkDeadline(entry);
    await this.start();
    this.#checkDeadline(entry);
    await this.#pruneCache(signal);
    this.#checkDeadline(entry);
    const page = await this.browser.newPage({ viewport: { width: 720, height: 2000 }, deviceScaleFactor: 2 });
    try {
      this.#checkDeadline(entry);
      await page.goto(`${this.origin}/?render=1`, { waitUntil: "networkidle", timeout: 30000 });
      this.#checkDeadline(entry);
      await page.evaluate((data) => window.TweetToaster.renderForBot(data), entry.payload);
      this.#checkDeadline(entry);
      await page.waitForFunction(() => window.__tweetToasterReady === true, null, { timeout: 30000 });
      this.#checkDeadline(entry);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const output = path.join(this.cacheDir, `${filename}.png`);
      entry.output = output;
      await page.locator("#capture").screenshot({ path: output, type: "png", animations: "disabled" });
      this.#checkDeadline(entry);
      return filename;
    } finally {
      if (!signal.aborted) await page.close();
    }
  }

  async #pruneCache(signal, { maxAgeMs = 24 * 60 * 60 * 1000, maxFiles = 500 } = {}) {
    const now = Date.now();
    const entries = [];
    for (const name of await readdir(this.cacheDir)) {
      signal.throwIfAborted();
      if (!/^\d{13}-[a-z0-9]{6}\.png$/.test(name)) continue;
      const filePath = path.join(this.cacheDir, name);
      const info = await stat(filePath);
      entries.push({ filePath, mtimeMs: info.mtimeMs });
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    await Promise.all(entries
      .filter((entry, index) => index >= maxFiles || now - entry.mtimeMs > maxAgeMs)
      .map((entry) => unlink(entry.filePath).catch(() => {})));
  }

  async #dispose(resource, force = false) {
    if (!resource.disposal) {
      resource.disposal = (async () => {
        let timer;
        try {
          if (force) {
            await resource.server.kill();
          } else {
            // Graceful shutdown has a short grace period; the fallback waits for
            // actual process exit instead of leaving Chromium alive in the back.
            await new Promise((resolve, reject) => {
              const kill = () => resource.server.kill().then(resolve, reject);
              timer = setTimeout(kill, 1000);
              resource.server.close().then(resolve, kill);
            });
          }
        } catch (error) {
          // A failed process cleanup must never permit a replacement process or
          // more queued work to accumulate alongside the unaccounted browser.
          this.#closed = true;
          this.#abortPending(error);
          throw error;
        } finally {
          clearTimeout(timer);
        }
        if (this.#resource === resource) {
          this.#resource = null;
          this.browser = null;
          this.browserServer = null;
        }
      })();
    }
    await resource.disposal;
  }

  async #terminate() {
    if (this.#resource) await this.#dispose(this.#resource, true);
    // launchServer itself is bounded. If cancellation races with startup, reap
    // its eventual process before allowing another render to start.
    await this.#starting?.catch(() => {});
    if (this.#resource) await this.#dispose(this.#resource, true);
  }

  #abortPending(error) {
    for (const entry of [...this.#pending]) entry.controller.abort(error);
  }

  async close() {
    this.#closed = true;
    const error = rendererError("图片渲染服务已关闭", "RENDERER_CLOSED");
    this.#abortPending(error);
    if (this.#active) {
      this.#active.controller.abort(error);
      await this.#active.task;
    }
    await this.#starting?.catch(() => {});
    if (this.#resource) await this.#dispose(this.#resource);
  }
}
