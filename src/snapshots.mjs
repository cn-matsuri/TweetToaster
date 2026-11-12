import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

// Only trusted, normalized provider data is stored here. Translations, uploaded
// logos and templates stay in the render request, not in this short-lived cache.
export class MemorySnapshotStore {
  #entries = new Map();
  #bytes = 0;
  #timer = null;
  #closed = false;

  constructor({ maxEntries = 100, maxBytes = 32 * 1024 * 1024, ttlMs = 30 * 60 * 1000, now = () => performance.now() } = {}) {
    for (const [name, value] of Object.entries({ maxEntries, maxBytes, ttlMs })) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
        throw new RangeError(`${name} must be a positive 32-bit integer`);
      }
    }
    if (typeof now !== "function") throw new TypeError("now must be a function");
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get size() { return this.#entries.size; }
  get byteLength() { return this.#bytes; }

  add(data) {
    if (this.#closed) throw snapshotError("查询缓存暂时不可用，请稍后重试", "SNAPSHOT_UNAVAILABLE");
    // A Buffer makes the payload-byte limit exact, independent of JS string
    // representation, and prevents later provider/render mutations changing it.
    const bytes = Buffer.from(JSON.stringify(data));
    if (bytes.length > this.maxBytes) {
      throw snapshotError("这次查询的内容过大，请改用具体推文链接", "SNAPSHOT_TOO_LARGE");
    }
    this.prune();
    while (this.#entries.size >= this.maxEntries || this.#bytes + bytes.length > this.maxBytes) {
      this.#delete(this.#entries.keys().next().value);
    }
    const id = randomUUID();
    this.#entries.set(id, { bytes, expiresAt: this.now() + this.ttlMs });
    this.#bytes += bytes.length;
    this.#schedule();
    return id;
  }

  get(id) {
    this.prune();
    const entry = this.#entries.get(id);
    return entry ? JSON.parse(entry.bytes.toString("utf8")) : null;
  }

  #delete(id) {
    const entry = this.#entries.get(id);
    if (!entry) return;
    this.#bytes -= entry.bytes.length;
    this.#entries.delete(id);
  }

  prune() {
    const now = this.now();
    for (const [id, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#delete(id);
    }
    this.#schedule();
  }

  #schedule() {
    clearTimeout(this.#timer);
    this.#timer = null;
    const first = this.#entries.values().next().value;
    if (!first || this.#closed) return;
    this.#timer = setTimeout(() => this.prune(), Math.max(1, Math.ceil(first.expiresAt - this.now())));
    this.#timer.unref?.();
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#entries.clear();
    this.#bytes = 0;
  }
}

function snapshotError(message, code) {
  return Object.assign(new Error(message), { status: 503, code });
}
