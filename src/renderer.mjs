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

export class BotRenderer {
  constructor({ origin, cacheDir, executablePath = process.env.CHROMIUM_PATH } = {}) {
    this.origin = origin;
    this.cacheDir = cacheDir;
    this.executablePath = executablePath;
    this.browser = null;
    this.tail = Promise.resolve();
  }

  async start() {
    if (this.browser) return;
    await mkdir(this.cacheDir, { recursive: true });
    const executablePath = await firstExecutable([
      this.executablePath,
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      ...MAC_BROWSERS
    ]);
    this.browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
  }

  async render(payload) {
    const operation = this.tail.then(() => this.#renderWithRetry(payload));
    this.tail = operation.catch(() => {});
    return operation;
  }

  async #renderWithRetry(payload) {
    try {
      return await this.#render(payload);
    } catch (firstError) {
      await this.close().catch(() => {});
      try {
        return await this.#render(payload);
      } catch (secondError) {
        secondError.cause = firstError;
        throw secondError;
      }
    }
  }

  async #render(payload) {
    await this.start();
    await this.#pruneCache();
    const page = await this.browser.newPage({ viewport: { width: 720, height: 2000 }, deviceScaleFactor: 2 });
    try {
      await page.goto(`${this.origin}/?render=1`, { waitUntil: "networkidle", timeout: 30000 });
      await page.evaluate((data) => window.TweetToaster.renderForBot(data), payload);
      await page.waitForFunction(() => window.__tweetToasterReady === true, null, { timeout: 30000 });
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const output = path.join(this.cacheDir, `${filename}.png`);
      await page.locator("#capture").screenshot({ path: output, type: "png", animations: "disabled" });
      return filename;
    } finally {
      await page.close();
    }
  }

  async #pruneCache({ maxAgeMs = 24 * 60 * 60 * 1000, maxFiles = 500 } = {}) {
    const now = Date.now();
    const entries = [];
    for (const name of await readdir(this.cacheDir)) {
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

  async close() {
    await this.browser?.close();
    this.browser = null;
  }
}
