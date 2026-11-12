import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider, normalizeConversationResponse, normalizeTimelineResponse, parseTweetInput } from "../src/provider.mjs";
import { conversationPayload, timelinePayload } from "./fixtures.mjs";

const query = parseTweetInput("x.com/ElonMusk");
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function post(id, screenName = "elonmusk", extra = {}) {
  const base = timelinePayload(screenName).results[0];
  return { ...base, id, url: `https://x.com/${screenName}/status/${id}`, ...extra };
}

test("profile results contain only the requested author, with case-insensitive exact handle matching", () => {
  const raw = [
    post("1"), post("2", "NarutoNolimits"), post("3", "Scobleizer"),
    post("4", "mntruell"), post("5", "laobaishare"), post("6", "ElonMusk"),
    post("7", "robotaxi"), post("8", "elonmusk"), post("9", "gregisenberg"),
    post("10", "teslaownersSV"), post("11", "elonmuskfan"),
    post("12", "other", { author: { name: "Elon Musk", screen_name: "other" } }),
    post("13", "other", { author: null }), post("14", "other", { author: { screen_name: 123 } })
  ];
  const data = normalizeTimelineResponse({ code: 200, results: raw }, query);
  assert.deepEqual(data.tweets.map((tweet) => tweet.id), ["1", "6", "8"]);
  assert.ok(data.tweets.every((tweet) => tweet.author.screenName.toLowerCase() === "elonmusk"));
  assert.equal(data.id, "1");
  assert.equal(data.focalIndex, 0);
  assert.equal(data.query.screenName, "ElonMusk");
});

test("filtering happens before deduplication and the display limit, preserving upstream order", () => {
  const raw = [
    post("1", "other"), post("2", "other"), post("3", "other"),
    post("3"), post("9"), post("3"), post("4")
  ];
  const data = normalizeTimelineResponse({ code: 200, results: raw }, query, { maxStatuses: 2 });
  assert.deepEqual(data.tweets.map((tweet) => tweet.id), ["3", "9"]);
  assert.equal(data.tweets[0].focal, true);
  assert.equal(data.tweets[1].focal, false);
});

test("grouped current and legacy threads cannot introduce other authors as standalone rows", () => {
  const raw = [
    { type: "thread", statuses: [post("0", "elonmusk", { type: "tombstone" }), post("1", "other"), post("2"), post("3", "fan")] },
    { type: "thread", thread: [post("4", "other"), post("5")], status: post("6", "other") },
    { type: "thread", status: post("7") },
    post("8", "other")
  ];
  const data = normalizeTimelineResponse({ code: 200, results: raw }, query);
  assert.deepEqual(data.tweets.map((tweet) => tweet.id), ["2", "5", "7"]);
  assert.equal(data.id, "2");
});

test("an authored quote post retains its quoted author inside the post, not as an extra row", () => {
  const quote = post("2", "Scobleizer", { text: "Quoted context" });
  const data = normalizeTimelineResponse({ code: 200, results: [post("1", "elonmusk", { quote }), quote] }, query);
  assert.equal(data.tweets.length, 1);
  assert.equal(data.tweets[0].author.screenName, "elonmusk");
  assert.equal(data.tweets[0].quote.author.screenName, "Scobleizer");
  assert.equal(data.tweets[0].quote.text, "Quoted context");
  assert.equal(data.tweets[0].quote.relation, "quote");
});

test("authorship retains self-reposts and authored thread replies, not someone else's reposted text", () => {
  const repostedBy = { screen_name: "elonmusk", name: "Elon Musk" };
  const selfRepost = post("1", "elonmusk", { reposted_by: repostedBy });
  const foreignRepost = post("2", "Scobleizer", { reposted_by: repostedBy });
  const ownReply = post("3", "elonmusk", { replying_to: { screen_name: "Scobleizer", status: "2" } });
  const data = normalizeTimelineResponse({ code: 200, results: [selfRepost, foreignRepost, { type: "thread", statuses: [foreignRepost, ownReply] }] }, query);
  assert.deepEqual(data.tweets.map((tweet) => tweet.id), ["1", "3"]);
  assert.equal(data.tweets[1].replyingTo, "Scobleizer");
  assert.equal(data.tweets[1].replyingToStatusId, "2");
});

test("a page containing only other authors fails explicitly instead of returning unrelated posts", () => {
  assert.throws(() => normalizeTimelineResponse({ code: 200, results: [post("1", "other")] }, query), (error) => {
    assert.equal(error.code, "TIMELINE_NOT_FOUND");
    assert.equal(error.status, 404);
    assert.match(error.message, /本人/);
    assert.match(error.message, /具体推文链接/);
    return true;
  });
});

test("both direct and recovered profile requests enforce authorship", async () => {
  for (const recover of [false, true]) {
    let requests = 0;
    const provider = new FxTwitterProvider({ fetchImpl: async () => {
      requests++;
      if (recover && requests === 1) return json({ code: 404 }, 404);
      if (recover && requests === 2) return json({ code: 200, user: { id: "44196397", screen_name: "elonmusk" } });
      return json({ code: 200, results: [post("1", "other"), post("2"), post("3", "fan"), post("4")] });
    } });
    const data = await provider.fetchTweet("@ElonMusk");
    assert.deepEqual(data.tweets.map((tweet) => tweet.id), ["2", "4"]);
    assert.equal(requests, recover ? 3 : 1);
  }
});

test("direct and recovered pages without authored posts keep the actionable empty result without further requests", async () => {
  for (const recover of [false, true]) {
    let requests = 0;
    const provider = new FxTwitterProvider({ fetchImpl: async () => {
      requests++;
      if (recover && requests === 1) return json({ code: 404 }, 404);
      if (recover && requests === 2) return json({ code: 200, user: { id: "44196397", screen_name: "elonmusk" } });
      return json({ code: 200, results: [post("1", "other")] });
    } });
    await assert.rejects(provider.fetchTweet("elonmusk"), (error) => {
      assert.equal(error.code, "TIMELINE_NOT_FOUND");
      assert.equal(error.status, 404);
      assert.match(error.message, /本人.*具体推文链接/);
      return true;
    });
    assert.equal(requests, recover ? 3 : 1);
  }
});

test("specific tweet conversations still expose replies written by other users", async () => {
  const payload = conversationPayload();
  const parsed = parseTweetInput(payload.status.url);
  const normalized = normalizeConversationResponse(payload, parsed);
  assert.deepEqual(normalized.tweets.map((tweet) => tweet.author.screenName), ["minatoaqua", "fan"]);
  assert.equal(normalized.tweets[1].relation, "reply");
  const provider = new FxTwitterProvider({ fetchImpl: async () => json(payload) });
  const data = await provider.fetchTweet(parsed.canonicalUrl);
  assert.deepEqual(data.tweets.map((tweet) => tweet.author.screenName), ["minatoaqua", "fan"]);
});
