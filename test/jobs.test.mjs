import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { setImmediate as turn } from "node:timers/promises";
import test from "node:test";
import { MemoryJobQueue } from "../src/jobs.mjs";

function clock(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
  t.mock.method(performance, "now", () => Date.now());
}

test("timeout fails polling immediately but keeps admission occupied until actual cleanup", async (t) => {
  clock(t);
  const jobs = new MemoryJobQueue({ maxActive: 1, ttlMs: 10, jobTimeoutMs: 50 });
  let signal;
  let finish;
  const id = jobs.add((options) => {
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  await turn();
  t.mock.timers.tick(11);
  jobs.prune();
  assert.equal(jobs.get(id).state, "STARTED", "result TTL must never delete live work");
  assert.throws(() => jobs.add(async () => "extra"), { code: "QUEUE_FULL", status: 503 });
  t.mock.timers.tick(39);
  assert.equal(signal.aborted, true);
  assert.equal(jobs.get(id).state, "FAILURE");
  assert.equal(jobs.get(id).code, "JOB_TIMEOUT");
  t.mock.timers.tick(100);
  jobs.prune();
  assert.equal(jobs.jobs.size, 1, "even expired results still account for unsettled cleanup");
  assert.throws(() => jobs.add(async () => "extra"), { code: "QUEUE_FULL" });
  finish("late success must not win");
  await turn();
  assert.equal(jobs.active.size, 0);
  assert.equal(jobs.get(id).code, "JOB_NOT_FOUND", "expired results are terminal, never synthetic PENDING");
  const healthy = jobs.add(async () => "recovered");
  await turn();
  assert.equal(jobs.get(healthy).result, "recovered");
  await jobs.close();
});

test("cooperative deadline cancellation releases slots and late failure cannot replace timeout", async (t) => {
  clock(t);
  const jobs = new MemoryJobQueue({ maxActive: 1, jobTimeoutMs: 20 });
  const id = jobs.add(({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("late cleanup error")), { once: true });
  }));
  await turn();
  t.mock.timers.tick(20);
  await turn();
  assert.equal(jobs.active.size, 0);
  assert.equal(jobs.get(id).code, "JOB_TIMEOUT");
  assert.match(jobs.get(id).error, /超时/);
  const next = jobs.add(async () => "ok");
  await turn();
  assert.equal(jobs.get(next).state, "SUCCESS");
  t.mock.timers.tick(100);
  assert.equal(jobs.get(next).state, "SUCCESS", "settled job timers must be cleared");
  await jobs.close();
});

test("retention begins at completion, storage stays bounded, and old IDs stop polling", async (t) => {
  clock(t);
  const jobs = new MemoryJobQueue({ maxJobs: 2, maxActive: 3, ttlMs: 100, jobTimeoutMs: 1000 });
  let finish;
  const id = jobs.add(() => new Promise((resolve) => { finish = resolve; }));
  await turn();
  t.mock.timers.tick(200);
  assert.equal(jobs.get(id).state, "STARTED");
  finish("done");
  await turn();
  t.mock.timers.tick(99);
  assert.equal(jobs.get(id).state, "SUCCESS");
  t.mock.timers.tick(1);
  assert.equal(jobs.get(id).code, "JOB_NOT_FOUND");
  for (let index = 0; index < 20; index += 1) {
    jobs.add(async () => index);
    assert.ok(jobs.jobs.size <= 2);
    await turn();
  }
  assert.equal(jobs.jobs.size, 2);
  assert.equal(jobs.get("unknown").state, "FAILURE");
  await jobs.close();
});

test("shutdown cancels admitted but unstarted work and rejects new admission", async () => {
  const jobs = new MemoryJobQueue();
  let calls = 0;
  const id = jobs.add(async () => { calls += 1; });
  await jobs.close();
  assert.equal(calls, 0);
  assert.equal(jobs.get(id).state, "FAILURE");
  assert.equal(jobs.get(id).code, "QUEUE_CLOSED");
  assert.equal(jobs.active.size, 0);
  assert.throws(() => jobs.add(async () => {}), { code: "QUEUE_CLOSED" });
  await jobs.close();
});

test("shutdown waits for real worker cleanup without overwriting prior terminal state", async () => {
  const jobs = new MemoryJobQueue();
  let completeCleanup;
  const id = jobs.add(({ signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { completeCleanup = resolve; }, { once: true });
  }));
  await turn();
  let closed = false;
  const closing = jobs.close().then(() => { closed = true; });
  await turn();
  assert.equal(closed, false);
  assert.equal(jobs.active.size, 1);
  assert.equal(jobs.get(id).code, "QUEUE_CLOSED");
  completeCleanup("too late");
  await closing;
  assert.equal(jobs.active.size, 0);
  assert.equal(jobs.get(id).code, "QUEUE_CLOSED");
});

test("sync errors and late success settle exactly once; limits are validated", async (t) => {
  clock(t);
  const jobs = new MemoryJobQueue({ jobTimeoutMs: 50 });
  const error = jobs.add(() => { throw new Error("test failure"); });
  const late = jobs.add(async () => {
    // Simulate a blocked event loop: the absolute deadline still rejects a
    // result, even if the timer callback could not run before it completed.
    t.mock.timers.setTime(10_100);
    return "too late";
  });
  await turn();
  assert.equal(jobs.get(error).error, "test failure");
  assert.equal(jobs.get(late).code, "JOB_TIMEOUT");
  assert.equal(jobs.active.size, 0);
  for (const option of ["maxJobs", "maxActive", "ttlMs", "jobTimeoutMs"]) {
    for (const value of [0, -1, NaN, Infinity, 0.5, 2 ** 31]) {
      assert.throws(() => new MemoryJobQueue({ [option]: value }), RangeError);
    }
  }
  await jobs.close();
});

test("wall-clock corrections cannot prematurely expire a running job", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
  let elapsed = 0;
  t.mock.method(performance, "now", () => elapsed);
  const jobs = new MemoryJobQueue({ jobTimeoutMs: 50 });
  const id = jobs.add(async () => {
    t.mock.timers.setTime(100_000);
    elapsed = 10;
    return "on time";
  });
  await turn();
  assert.equal(jobs.get(id).state, "SUCCESS");
  await jobs.close();
});
