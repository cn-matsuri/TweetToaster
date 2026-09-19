import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { normalizedTweet } from "./fixtures.mjs";

async function withServer(callback, options = {}) {
  const calls = [];
  const jobs = options.jobs || new MemoryJobQueue();
  const server = createTweetToasterServer({
    provider: { fetchTweet: async (url) => { calls.push(url); return normalizedTweet(); } },
    jobs,
    renderBot: async (payload) => { calls.push(payload); return "rendered-file"; },
    ...options
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await callback({ origin, calls }); }
  finally {
    await jobs.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("health and tweet API return JSON", () => withServer(async ({ origin, calls }) => {
  assert.equal((await fetch(`${origin}/api/health`).then((r) => r.json())).status, "ok");
  const response = await fetch(`${origin}/api/tweet`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://x.com/minatoaqua/status/1383771374183878658" })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tweets[0].id, "1383771374183878658");
  assert.equal(calls[0], "https://x.com/minatoaqua/status/1383771374183878658");
}));

test("legacy bot contract creates and polls a render job", () => withServer(async ({ origin, calls }) => {
  const created = await fetch(`${origin}/api/auto`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ tweet: "https://x.com/minatoaqua/status/1383771374183878658", translate: "开始啦！", template: "", noLikes: true })
  });
  assert.equal(created.status, 200);
  const { task_id: taskId } = await created.json();
  let job;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    job = await fetch(`${origin}/api/get_task=${taskId}`).then((r) => r.json());
    if (job.state === "SUCCESS") break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(job.state, "SUCCESS");
  assert.equal(job.result, "rendered-file");
  assert.equal(calls[1].translate, "开始啦！");
  assert.equal(calls[1].noLikes, true);
  assert.equal(calls[1].timeZone, undefined, "old Bot clients need not send a timezone");
}));

test("browser render contract preserves exact selection and custom render settings", () => withServer(async ({ origin, calls }) => {
  const created = await fetch(`${origin}/api/render`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tweet: "minatoaqua",
      selection: [{ id: "1383771374183878658", translation: "精确翻译" }],
      template: "",
      noLikes: false,
      logo: "none",
      fontSize: 30,
      timeZone: "Asia/Shanghai"
    })
  });
  assert.equal(created.status, 200);
  const { task_id: taskId } = await created.json();
  let job;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    job = await fetch(`${origin}/api/get_task=${taskId}`).then((r) => r.json());
    if (job.state === "SUCCESS") break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(job.state, "SUCCESS");
  assert.deepEqual(calls[1].selection, [{ id: "1383771374183878658", translation: "精确翻译" }]);
  assert.equal(calls[1].fontSize, 30);
  assert.equal(calls[1].timeZone, "Asia/Shanghai");
}));

test("render and legacy Bot APIs reject invalid timezones before fetching tweets", () => withServer(async ({ origin, calls }) => {
  for (const endpoint of ["/api/render", "/api/auto"]) {
    for (const timeZone of ["Mars/Olympus", 8, {}, "x".repeat(101)]) {
      const response = await fetch(`${origin}${endpoint}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tweet: "minatoaqua",
          selection: [{ id: "1383771374183878658", translation: "翻译" }],
          timeZone
        })
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "INVALID_TIME_ZONE");
    }
  }
  assert.equal(calls.length, 0);
}));

test("browser render contract rejects empty selections and unsafe custom logos", () => withServer(async ({ origin }) => {
  const empty = await fetch(`${origin}/api/render`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ tweet: "minatoaqua", selection: [] })
  });
  assert.equal(empty.status, 400);

  const unsafeLogo = await fetch(`${origin}/api/render`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tweet: "minatoaqua",
      selection: [{ id: "1383771374183878658", translation: "" }],
      logo: "custom",
      customLogo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
    })
  });
  assert.equal(unsafeLogo.status, 400);
}));

test("invalid JSON is rejected with a useful error", () => withServer(async ({ origin }) => {
  const response = await fetch(`${origin}/api/tweet`, { method: "POST", headers: { "content-type": "application/json" }, body: "not-json" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /JSON/);
}));

test("bot API loads a mounted legacy template path", async () => {
  const publicDir = await mkdtemp(path.join(os.tmpdir(), "tweet-toaster-public-"));
  await mkdir(path.join(publicDir, "template"));
  await writeFile(path.join(publicDir, "template", "legacy.txt"), "<div>{T}</div>");
  await withServer(async ({ origin, calls }) => {
    const { task_id: taskId } = await fetch(`${origin}/api/auto`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tweet: "https://x.com/user/status/123", translate: "翻译", template: "/template/legacy.txt" })
    }).then((response) => response.json());
    let job;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      job = await fetch(`${origin}/api/get_task=${taskId}`).then((response) => response.json());
      if (job.state === "SUCCESS") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(job.state, "SUCCESS");
    assert.equal(calls[1].template, "<div>{T}</div>");
  }, { publicDir });
});

async function pollTerminal(origin, taskId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = await fetch(`${origin}/api/get_task=${taskId}`).then((response) => response.json());
    if (task.state === "SUCCESS" || task.state === "FAILURE") return task;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("task did not reach a terminal state");
}

test("all queued APIs propagate deadlines to provider, fail explicitly, and recover", async () => {
  for (const endpoint of ["/api/auto", "/api/render", "/api/tasks"]) {
    const jobs = new MemoryJobQueue({ maxActive: 1, jobTimeoutMs: 100 });
    let fail = true;
    let aborted = false;
    let renderCalls = 0;
    const provider = { fetchTweet: async (input, { signal }) => {
      assert.ok(signal instanceof AbortSignal);
      if (!fail) return normalizedTweet();
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true }));
    } };
    await withServer(async ({ origin }) => {
      const submit = () => fetch(`${origin}${endpoint}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tweet: "minatoaqua", url: "minatoaqua", selection: [{ id: "1383771374183878658", translation: "翻译" }] })
      }).then((response) => response.json());
      const timedOut = await submit();
      const result = await pollTerminal(origin, timedOut.task_id);
      assert.equal(result.state, "FAILURE");
      assert.equal(result.code, "JOB_TIMEOUT");
      assert.match(result.error, /超时/);
      assert.equal(aborted, true);
      assert.equal(renderCalls, 0, "aborted fetch must not start a render later");
      fail = false;
      const healthy = await submit();
      assert.equal((await pollTerminal(origin, healthy.task_id)).state, "SUCCESS");
      assert.equal((await pollTerminal(origin, timedOut.task_id)).code, "JOB_TIMEOUT");
      const missing = await fetch(`${origin}/api/get_task=unknown`).then((response) => response.json());
      assert.equal(missing.state, "FAILURE");
      assert.equal(missing.code, "JOB_NOT_FOUND");
    }, { jobs, provider, renderBot: async (payload, { signal }) => {
      assert.equal(signal.aborted, false);
      renderCalls += 1;
      return "healthy-render";
    } });
  }
});

test("render cancellation reaches the same signal and admission waits for its cleanup", async () => {
  const jobs = new MemoryJobQueue({ maxActive: 1, jobTimeoutMs: 100 });
  let providerSignal;
  let completeCleanup;
  let aborted = false;
  await withServer(async ({ origin }) => {
    const { task_id: taskId } = await fetch(`${origin}/api/auto`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tweet: "minatoaqua" })
    }).then((response) => response.json());
    const result = await pollTerminal(origin, taskId);
    assert.equal(result.code, "JOB_TIMEOUT");
    assert.equal(aborted, true);
    assert.equal(jobs.active.size, 1);
    assert.throws(() => jobs.add(async () => "extra"), { code: "QUEUE_FULL" });
    completeCleanup("must not overwrite failure");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(jobs.active.size, 0);
    assert.equal((await pollTerminal(origin, taskId)).code, "JOB_TIMEOUT");
  }, {
    jobs,
    provider: { fetchTweet: async (input, { signal }) => { providerSignal = signal; return normalizedTweet(); } },
    renderBot: (payload, { signal }) => new Promise((resolve) => {
      assert.equal(signal, providerSignal);
      signal.addEventListener("abort", () => { aborted = true; completeCleanup = resolve; }, { once: true });
    })
  });
});

test("disconnecting a direct tweet request aborts its upstream work", { timeout: 5000 }, async () => {
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let cancelled;
  const stopped = new Promise((resolve) => { cancelled = resolve; });
  await withServer(async ({ origin }) => {
    const request = http.request(`${origin}/api/tweet`, { method: "POST", headers: { "content-type": "application/json" } });
    request.on("error", () => {});
    request.end(JSON.stringify({ url: "minatoaqua" }));
    await started;
    request.destroy();
    await stopped;
  }, { provider: { fetchTweet: async (input, { signal }) => new Promise((resolve, reject) => {
    entered();
    signal.addEventListener("abort", () => { cancelled(); reject(signal.reason); }, { once: true });
  }) } });
});
