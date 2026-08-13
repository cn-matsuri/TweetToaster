import assert from "node:assert/strict";
import test from "node:test";
import { FxTwitterProvider, isPrivateHostname, normalizeProviderResponse, parseTweetUrl, TweetProviderError } from "../src/provider.mjs";
import { providerPayload } from "./fixtures.mjs";
import { MemoryJobQueue } from "../src/jobs.mjs";

test("parseTweetUrl accepts current and legacy X hosts", () => {
  for (const url of [
    "https://x.com/minatoaqua/status/1383771374183878658?s=20",
    "https://twitter.com/minatoaqua/status/1383771374183878658",
    "https://mobile.twitter.com/minatoaqua/status/1383771374183878658"
  ]) assert.equal(parseTweetUrl(url).id, "1383771374183878658");
});

test("parseTweetUrl rejects profiles and unrelated hosts", () => {
  for (const url of ["https://x.com/minatoaqua", "https://example.com/user/status/123"]) {
    assert.throws(() => parseTweetUrl(url), TweetProviderError);
  }
});

test("normalizer returns a stable renderer model", () => {
  const parsed = parseTweetUrl("https://x.com/minatoaqua/status/1383771374183878658");
  const value = normalizeProviderResponse(providerPayload(), parsed);
  assert.equal(value.focalIndex, 0);
  assert.equal(value.tweets[0].author.screenName, "minatoaqua");
  assert.equal(value.tweets[0].counts.likes, 6406);
  assert.equal(value.tweets[0].focal, true);
});

test("provider identifies itself and supports an override base URL", async () => {
  let request;
  const provider = new FxTwitterProvider({
    baseUrl: "https://provider.example/status/",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(providerPayload()), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const result = await provider.fetchTweet("https://x.com/minatoaqua/status/1383771374183878658");
  assert.equal(request.url, "https://provider.example/status/1383771374183878658");
  assert.match(request.options.headers["user-agent"], /TweetToaster/);
  assert.equal(result.id, "1383771374183878658");
});

test("job queue rejects overload instead of growing without limit", () => {
  const jobs = new MemoryJobQueue({ maxActive: 1 });
  jobs.add(() => new Promise(() => {}));
  assert.throws(() => jobs.add(async () => "never"), /队列已满/);
});

test("private address detection covers IPv4 and IPv6", () => {
  for (const value of ["127.0.0.1", "10.1.2.3", "172.31.4.5", "192.168.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateHostname(value), true, value);
  }
  assert.equal(isPrivateHostname("1.1.1.1"), false);
});
