import assert from "node:assert/strict";
import test from "node:test";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { normalizedTweet } from "./fixtures.mjs";

async function service(t) {
  const renders = [];
  let queries = 0;
  const jobs = new MemoryJobQueue();
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => { queries++; return normalizedTweet(); } },
    jobs,
    renderBot: async (payload) => { renders.push(payload); return "language-test"; }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await jobs.close(); await new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (endpoint, extra) => {
    const response = await fetch(`${origin}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tweet: "https://x.com/minatoaqua/status/1383771374183878658",
        selection: [{ id: "1383771374183878658", translation: "Keep my 中文 translation" }],
        timeZone: "Asia/Shanghai", ...extra
      })
    });
    return { status: response.status, body: await response.json() };
  };
  const done = async (id) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const job = jobs.get(id);
      if (job.state !== "PENDING") return job;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail("language render did not finish");
  };
  return { renders, post, done, jobs, queries: () => queries };
}

test("browser and Bot language choices preserve translations and timezone; legacy clients stay Chinese", async (t) => {
  const app = await service(t);
  for (const endpoint of ["/api/render", "/api/auto"]) {
    for (const language of [undefined, "zh", "en"]) {
      const result = await app.post(endpoint, { language });
      assert.equal(result.status, 200);
      assert.equal((await app.done(result.body.task_id)).state, "SUCCESS");
      const rendered = app.renders.at(-1);
      assert.equal(rendered.language, language || "zh");
      assert.equal(rendered.timeZone, "Asia/Shanghai");
      assert.equal(rendered.selection[0].translation, "Keep my 中文 translation");
    }
  }
});

test("unsupported language values are rejected before fetching posts or admitting a render", async (t) => {
  const app = await service(t);
  for (const endpoint of ["/api/render", "/api/auto"]) {
    for (const language of ["", "fr", "zh-CN", "en-US", 1, {}, [], "<script>"]) {
      const result = await app.post(endpoint, { language });
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, "INVALID_LANGUAGE");
    }
  }
  assert.equal(app.queries(), 0);
  assert.equal(app.renders.length, 0);
  assert.equal(app.jobs.jobs.size, 0);
});
