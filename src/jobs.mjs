import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export class MemoryJobQueue {
  constructor({ maxJobs = 500, maxActive = 50, ttlMs = 60 * 60 * 1000, jobTimeoutMs = 45_000 } = {}) {
    for (const [name, value] of Object.entries({ maxJobs, maxActive, ttlMs, jobTimeoutMs })) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
        throw new RangeError(`${name} must be a positive 32-bit integer`);
      }
    }
    this.jobs = new Map();
    // Admission tracks actual unsettled work, independently of public results.
    this.active = new Map();
    this.maxJobs = maxJobs;
    this.maxActive = maxActive;
    this.ttlMs = ttlMs;
    this.jobTimeoutMs = jobTimeoutMs;
    this.closed = false;
  }

  add(worker) {
    if (this.closed) throw jobError("服务器正在关闭，请稍后重试", "QUEUE_CLOSED");
    if (typeof worker !== "function") throw new TypeError("worker must be a function");
    if (this.active.size >= Math.min(this.maxActive, this.maxJobs)) {
      throw jobError("任务队列已满，请稍后重试", "QUEUE_FULL");
    }
    this.prune(this.maxJobs - 1);
    const id = randomUUID();
    const job = { id, state: "PENDING", result: null, error: null, createdAt: Date.now() };
    const deadlineAt = performance.now() + this.jobTimeoutMs;
    const controller = new AbortController();
    let settled;
    const done = new Promise((resolve) => { settled = resolve; });
    const cancel = (error) => {
      this.fail(job, error);
      controller.abort(error);
    };
    const checkDeadline = () => {
      if (!controller.signal.aborted && performance.now() >= deadlineAt) {
        cancel(jobError("任务处理超时，请稍后重试", "JOB_TIMEOUT"));
      }
      controller.signal.throwIfAborted();
    };
    const timer = setTimeout(() => cancel(jobError("任务处理超时，请稍后重试", "JOB_TIMEOUT")), this.jobTimeoutMs);
    timer.unref?.();
    this.active.set(id, { cancel, done });
    this.jobs.set(id, job);
    queueMicrotask(async () => {
      try {
        checkDeadline();
        job.state = "STARTED";
        const result = await worker({ signal: controller.signal });
        checkDeadline();
        job.result = result;
        job.state = "SUCCESS";
        job.finishedAt = Date.now();
      } catch (error) {
        this.fail(job, error);
      } finally {
        clearTimeout(timer);
        // A timeout is NOT completion: only the worker's resource cleanup can
        // release this slot. An uncooperative worker therefore fails closed.
        this.active.delete(id);
        this.prune();
        settled();
      }
    });
    return id;
  }

  fail(job, error) {
    if (job.state === "SUCCESS" || job.state === "FAILURE") return;
    job.error = error?.message || "任务失败";
    job.code = error?.code || "JOB_FAILED";
    job.result = job.error;
    job.state = "FAILURE";
    job.finishedAt = Date.now();
  }

  get(id) {
    this.prune();
    const error = "任务不存在或结果已过期，请重新提交";
    return this.jobs.get(id) || { id, state: "FAILURE", result: error, error, code: "JOB_NOT_FOUND" };
  }

  prune(limit = this.maxJobs) {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if (!this.active.has(id) && (job.finishedAt <= cutoff || this.jobs.size > limit)) this.jobs.delete(id);
    }
  }

  close() {
    this.closed = true;
    const active = [...this.active.values()];
    for (const entry of active) entry.cancel(jobError("服务器正在关闭，请重新提交任务", "QUEUE_CLOSED"));
    return Promise.all(active.map((entry) => entry.done));
  }
}

function jobError(message, code) {
  return Object.assign(new Error(message), { status: 503, code });
}
