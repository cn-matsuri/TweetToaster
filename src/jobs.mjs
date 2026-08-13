import { randomUUID } from "node:crypto";

export class MemoryJobQueue {
  constructor({ maxJobs = 500, maxActive = 50, ttlMs = 60 * 60 * 1000 } = {}) {
    this.jobs = new Map();
    this.maxJobs = maxJobs;
    this.maxActive = maxActive;
    this.ttlMs = ttlMs;
  }

  add(worker) {
    this.prune();
    const active = [...this.jobs.values()].filter((job) => job.state === "PENDING" || job.state === "STARTED").length;
    if (active >= this.maxActive) {
      const error = new Error("任务队列已满，请稍后重试");
      error.status = 503;
      error.code = "QUEUE_FULL";
      throw error;
    }
    const id = randomUUID();
    const job = { id, state: "PENDING", result: null, error: null, createdAt: Date.now() };
    this.jobs.set(id, job);
    queueMicrotask(async () => {
      job.state = "STARTED";
      try {
        job.result = await worker();
        job.state = "SUCCESS";
      } catch (error) {
        job.error = error?.message || "任务失败";
        job.result = job.error;
        job.state = "FAILURE";
      }
    });
    return id;
  }

  get(id) {
    return this.jobs.get(id) || { id, state: "PENDING", result: null, error: null };
  }

  prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      const finished = job.state === "SUCCESS" || job.state === "FAILURE";
      if (finished && (job.createdAt < cutoff || this.jobs.size > this.maxJobs)) this.jobs.delete(id);
    }
  }
}
