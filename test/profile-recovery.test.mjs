import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { setImmediate as turn } from "node:timers/promises";
import test from "node:test";
import { FxTwitterProvider, normalizeTimelineResponse, parseTweetInput } from "../src/provider.mjs";
import { timelinePayload } from "./fixtures.mjs";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const profile = () => ({ code: 200, user: { id: "44196397", screen_name: "elonmusk" } });

for (const status of [404, 200]) {
  test(`username timeline 404 (${status} HTTP) recovers through a verified public profile ID`, async () => {
    const calls = [];
    const provider = new FxTwitterProvider({ baseUrl: "https://example.com/2", fetchImpl: async (url) => {
      calls.push(url);
      if (calls.length === 1) return json({ code: 404, results: [] }, status);
      if (calls.length === 2) return json(profile());
      return json(timelinePayload());
    } });
    const data = await provider.fetchTweet("@ElonMusk");
    assert.deepEqual(calls, [
      "https://example.com/2/profile/ElonMusk/statuses?count=12",
      "https://example.com/2/profile/ElonMusk",
      "https://example.com/2/profile/id:44196397/statuses?count=12"
    ]);
    assert.equal(data.tweets.length, 2);
    assert.equal(data.query.screenName, "ElonMusk");
    assert.equal(data.canonicalUrl, "https://x.com/ElonMusk");
  });
}

test("profile recovery rejects wrong identities and malformed IDs instead of reading another account", async () => {
  for (const user of [
    { id: "44196397", screen_name: "someoneelse" },
    { id: "../other", screen_name: "elonmusk" },
    { id: 44196397, screen_name: "elonmusk" },
    null
  ]) {
    let count = 0;
    const provider = new FxTwitterProvider({ fetchImpl: async () => {
      count++;
      return count === 1 ? json({ code: 404 }, 404) : json({ code: 200, user });
    } });
    await assert.rejects(provider.fetchTweet("elonmusk"), { code: "TIMELINE_UNAVAILABLE", status: 503 });
    assert.equal(count, 2);
  }
});

test("unavailable profiles fail clearly after bounded recovery, without guessing the account is absent", async () => {
  let count = 0;
  const provider = new FxTwitterProvider({ fetchImpl: async () => {
    count++;
    return json({ code: 404 }, 404);
  } });
  await assert.rejects(provider.fetchTweet("missinguser"), (error) => {
    assert.equal(error.code, "TIMELINE_UNAVAILABLE");
    assert.match(error.message, /具体推文链接/);
    assert.doesNotMatch(error.message, /账号不存在/);
    return true;
  });
  assert.equal(count, 2);
});

test("rate limits, outages and genuinely empty timelines do not trigger extra identity requests", async () => {
  for (const [status, payload] of [[429, { code: 429 }], [500, { code: 500 }], [200, { code: 200, results: [] }]]) {
    let count = 0;
    const provider = new FxTwitterProvider({ fetchImpl: async () => { count++; return json(payload, status); } });
    await assert.rejects(provider.fetchTweet("elonmusk"));
    assert.equal(count, 1);
  }
});

test("cancellation during profile recovery prevents the ID timeline request and cleans listeners", async () => {
  const controller = new AbortController();
  const entered = Promise.withResolvers();
  let count = 0;
  const provider = new FxTwitterProvider({ fetchImpl: async (url, { signal }) => {
    count++;
    if (count === 1) return json({ code: 404 }, 404);
    entered.resolve();
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  const reason = new Error("user cancelled");
  const result = assert.rejects(provider.fetchTweet("elonmusk", { signal: controller.signal }), (error) => error === reason);
  await entered.promise;
  controller.abort(reason);
  await result;
  assert.equal(count, 2);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("identity recovery shares one total deadline instead of restarting the timeout per request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = Promise.withResolvers();
  let count = 0;
  let aborted = false;
  const provider = new FxTwitterProvider({ timeoutMs: 1000, fetchImpl: async (url, { signal }) => {
    count++;
    if (count === 1) return first.promise;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => {
      aborted = true;
      reject(signal.reason);
    }, { once: true }));
  } });
  const outcome = assert.rejects(provider.fetchTweet("elonmusk"), { code: "PROVIDER_UNAVAILABLE", status: 503 });
  t.mock.timers.tick(700);
  first.resolve(json({ code: 404 }, 404));
  await turn();
  assert.equal(count, 2);
  t.mock.timers.tick(301);
  await outcome;
  assert.equal(aborted, true);
  assert.equal(count, 2);
});

test("timeline supports current grouped statuses and legacy thread entries", () => {
  const payload = timelinePayload();
  const first = payload.results[0];
  const second = payload.results[1];
  payload.results = [{ type: "thread", statuses: [first, second] }, { type: "thread", thread: [first], status: second }];
  const data = normalizeTimelineResponse(payload, parseTweetInput("suisei_hosimati"));
  assert.deepEqual(data.tweets.map((tweet) => tweet.id), [first.id, second.id]);
});
