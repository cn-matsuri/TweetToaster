import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { normalizedTweet } from "./fixtures.mjs";

async function withServer(callback, options = {}) {
  const calls = [];
  const server = createTweetToasterServer({
    provider: { fetchTweet: async (url) => { calls.push(url); return normalizedTweet(); } },
    jobs: new MemoryJobQueue(),
    renderBot: async (payload) => { calls.push(payload); return "rendered-file"; },
    ...options
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await callback({ origin, calls }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
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
