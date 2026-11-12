import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createTweetToasterServer } from "../src/app.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";
import { MemorySnapshotStore } from "../src/snapshots.mjs";
import { normalizedConversation } from "./fixtures.mjs";

function timeline() {
  return {
    ...normalizedConversation(),
    mode: "timeline",
    canonicalUrl: "https://x.com/elonmusk",
    query: { kind: "profile", screenName: "elonmusk", canonicalUrl: "https://x.com/elonmusk" }
  };
}

async function withServer(t, options = {}) {
  const calls = [];
  const jobs = options.jobs || new MemoryJobQueue();
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => timeline() },
    renderBot: async (payload, { signal }) => {
      signal.throwIfAborted();
      calls.push(payload);
      return "snapshot-png";
    },
    ...options,
    jobs
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await jobs.close?.();
    await new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (endpoint, body) => {
    const response = await fetch(`${origin}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const poll = async (id) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await fetch(`${origin}/api/get_task=${id}`).then((response) => response.json());
      if (result.state === "SUCCESS" || result.state === "FAILURE") return result;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail("job never reached a terminal state");
  };
  return { post, poll, jobs, calls };
}

function renderRequest(data, overrides = {}) {
  return {
    tweet: data.query.canonicalUrl,
    snapshotId: data.snapshotId,
    selection: data.tweets.map((tweet, index) => ({ id: tweet.id, translation: `第 ${index + 1} 条翻译` })),
    logo: "none",
    fontSize: 30,
    timeZone: "Asia/Shanghai",
    ...overrides
  };
}

test("browser export uses the exact queried snapshot even if the timeline changes or provider fails", async (t) => {
  let requests = 0;
  const providerData = timeline();
  const { post, poll, calls } = await withServer(t, {
    provider: { fetchTweet: async () => {
      requests++;
      if (requests > 1) throw new Error("upstream unavailable after query");
      return providerData;
    } }
  });
  const queried = await post("/api/tweet", { url: "elonmusk" });
  assert.equal(queried.status, 200);
  assert.match(queried.body.snapshotId, /^[0-9a-f-]{36}$/);
  const expected = structuredClone(providerData);
  // Neither a changing provider object nor forged client-side data can replace
  // the server's trusted copy of the preview.
  providerData.tweets.shift();
  providerData.tweets[0].text = "new timeline text";
  const request = renderRequest(queried.body, { data: { tweets: [{ text: "forged" }] } });
  const created = await post("/api/render", request);
  assert.equal(created.status, 200);
  assert.equal((await poll(created.body.task_id)).state, "SUCCESS");
  assert.equal(requests, 1);
  assert.deepEqual(calls[0].data, expected);
  assert.deepEqual(calls[0].selection, request.selection);
  assert.equal(calls[0].fontSize, 30);
  assert.equal(calls[0].timeZone, "Asia/Shanghai");
  const repeated = await post("/api/render", request);
  assert.equal((await poll(repeated.body.task_id)).state, "SUCCESS");
  assert.equal(requests, 1, "repeat downloads need not refetch a fast-moving account");
});

test("expired or missing snapshots fail before admission and never silently refetch", async (t) => {
  let elapsed = 0;
  let requests = 0;
  const snapshots = new MemorySnapshotStore({ ttlMs: 10, now: () => elapsed });
  const { post, jobs, calls } = await withServer(t, {
    snapshots,
    provider: { fetchTweet: async () => { requests++; return timeline(); } }
  });
  const { body: data } = await post("/api/tweet", { url: "elonmusk" });
  elapsed = 10;
  for (const snapshotId of [data.snapshotId, randomUUID()]) {
    const response = await post("/api/render", renderRequest(data, { snapshotId }));
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "SNAPSHOT_EXPIRED");
  }
  assert.equal(requests, 1);
  assert.equal(jobs.jobs.size, 0);
  assert.equal(calls.length, 0);
});

test("snapshot IDs, source identity, and every selected tweet are validated before admission", async (t) => {
  const { post, jobs, calls } = await withServer(t);
  const { body: data } = await post("/api/tweet", { url: "elonmusk" });
  for (const snapshotId of ["", "not-a-token", "x".repeat(1000), 123, {}, []]) {
    const response = await post("/api/render", renderRequest(data, { snapshotId }));
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_SNAPSHOT");
  }
  const mismatched = await post("/api/render", renderRequest(data, { tweet: "suisei_hosimati" }));
  assert.equal(mismatched.status, 409);
  assert.equal(mismatched.body.error.code, "SNAPSHOT_MISMATCH");
  const missing = await post("/api/render", renderRequest(data, {
    selection: [{ id: data.tweets[0].id, translation: "valid" }, { id: "9999999999999999999", translation: "must not vanish" }]
  }));
  assert.equal(missing.status, 409);
  assert.equal(missing.body.error.code, "SELECTION_NOT_FOUND");
  assert.equal(jobs.jobs.size, 0);
  assert.equal(calls.length, 0);
});

test("equivalent X input forms can export the matching snapshot", async (t) => {
  const { post, poll } = await withServer(t);
  const { body: data } = await post("/api/tweet", { url: "elonmusk" });
  for (const tweet of ["@ElonMusk", "twitter.com/elonmusk", "https://x.com/elonmusk?lang=zh"]) {
    const response = await post("/api/render", renderRequest(data, { tweet }));
    assert.equal(response.status, 200);
    assert.equal((await poll(response.body.task_id)).state, "SUCCESS");
  }
});

test("cache eviction after admission cannot change a queued render", async (t) => {
  const snapshots = new MemorySnapshotStore({ maxEntries: 1 });
  let run;
  const jobs = { add: (worker) => { run = worker; return "pending-id"; } };
  const { post, calls } = await withServer(t, { snapshots, jobs });
  const { body: first } = await post("/api/tweet", { url: "elonmusk" });
  assert.equal((await post("/api/render", renderRequest(first))).status, 200);
  await post("/api/tweet", { url: "elonmusk" });
  assert.equal(snapshots.get(first.snapshotId), null);
  assert.equal(await run({ signal: new AbortController().signal }), "snapshot-png");
  assert.deepEqual(calls[0].data.tweets, first.tweets);
});

test("legacy render and Bot clients without snapshots still work, but never export a partial selection", async (t) => {
  let requests = 0;
  const { post, poll, calls } = await withServer(t, {
    provider: { fetchTweet: async () => { requests++; return timeline(); } }
  });
  const data = timeline();
  const legacyBrowser = await post("/api/render", renderRequest(data));
  assert.equal((await poll(legacyBrowser.body.task_id)).state, "SUCCESS");
  const legacyBot = await post("/api/auto", { tweet: "elonmusk", translate: "旧 Bot 翻译" });
  assert.equal((await poll(legacyBot.body.task_id)).state, "SUCCESS");
  for (const endpoint of ["/api/render", "/api/auto"]) {
    const missing = await post(endpoint, renderRequest(data, {
      selection: [{ id: data.tweets[0].id, translation: "valid" }, { id: "9999999999999999999", translation: "missing" }]
    }));
    assert.equal(missing.status, 200);
    const result = await poll(missing.body.task_id);
    assert.equal(result.state, "FAILURE");
    assert.equal(result.code, "SELECTION_NOT_FOUND");
  }
  assert.equal(requests, 4);
  assert.equal(calls.length, 2);
});

test("oversized query snapshots fail clearly instead of returning an unstable preview", async (t) => {
  t.mock.method(console, "error", () => {});
  const snapshots = new MemorySnapshotStore({ maxBytes: 64 });
  const { post } = await withServer(t, { snapshots });
  const response = await post("/api/tweet", { url: "elonmusk" });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, "SNAPSHOT_TOO_LARGE");
  assert.equal(snapshots.size, 0);
});
