import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider } from "../src/provider.mjs";

test("live free provider returns a profile timeline and selectable replies", { timeout: 45000 }, async () => {
  const provider = new FxTwitterProvider();
  const timeline = await provider.fetchTweet("x.com/suisei_hosimati");
  assert.equal(timeline.mode, "timeline");
  assert.ok(timeline.tweets.length >= 3);
  assert.equal(timeline.query.screenName.toLowerCase(), "suisei_hosimati");

  const conversation = await provider.fetchTweet("x.com/suisei_hosimati/status/2087881201143136469");
  assert.equal(conversation.mode, "conversation");
  assert.ok(conversation.tweets.some((tweet) => tweet.focal));
  assert.ok(conversation.tweets.some((tweet) => tweet.relation === "reply"));
});
