import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider } from "../src/provider.mjs";

test("live free provider returns a profile timeline and selectable replies", { timeout: 45000 }, async () => {
  const provider = new FxTwitterProvider();
  const timeline = await provider.fetchTweet("x.com/suisei_hosimati");
  assert.equal(timeline.mode, "timeline");
  assert.ok(timeline.tweets.length > 0);
  assert.equal(timeline.query.screenName.toLowerCase(), "suisei_hosimati");
  assert.ok(timeline.tweets.every((tweet) => tweet.author.screenName.toLowerCase() === "suisei_hosimati"));

  const conversation = await provider.fetchTweet("x.com/suisei_hosimati/status/2087881201143136469");
  assert.equal(conversation.mode, "conversation");
  assert.ok(conversation.tweets.some((tweet) => tweet.focal));
  assert.ok(conversation.tweets.some((tweet) => tweet.relation === "reply"));
});

test("live elonmusk timeline remains readable through the verified ID recovery route", { timeout: 30000 }, async () => {
  let requests = 0;
  const provider = new FxTwitterProvider({ fetchImpl: async (url, options) => {
    requests++;
    // Reproduce the observed transient username-route 404. The identity lookup
    // and ID timeline below are real requests to the free public provider.
    if (requests === 1) return new Response(JSON.stringify({ code: 404, results: [] }), { status: 404 });
    return fetch(url, options);
  } });
  const data = await provider.fetchTweet("elonmusk");
  assert.equal(data.mode, "timeline");
  assert.ok(data.tweets.length > 0);
  assert.equal(data.query.screenName, "elonmusk");
  assert.ok(data.tweets.every((tweet) => tweet.author.screenName.toLowerCase() === "elonmusk"));
  assert.equal(requests, 3);
});
