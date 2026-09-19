import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import http from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { FxTwitterProvider } from "../src/provider.mjs";
import { providerPayload, timelinePayload } from "./fixtures.mjs";

test("provider does not start a pre-cancelled request", async () => {
  let requests = 0;
  const provider = new FxTwitterProvider({ fetchImpl: async () => { requests++; } });
  const reason = new Error("job cancelled");
  await assert.rejects(provider.fetchTweet("suisei_hosimati", { signal: AbortSignal.abort(reason) }), (error) => error === reason);
  assert.equal(requests, 0);
});

test("provider cancellation waits for body cleanup and never starts the fallback", async () => {
  const controller = new AbortController();
  let startReading;
  const reading = new Promise((resolve) => { startReading = resolve; });
  let finishCleanup;
  const cleanup = new Promise((resolve) => { finishCleanup = resolve; });
  let cancelled = false;
  let requests = 0;
  const provider = new FxTwitterProvider({ fetchImpl: async () => {
    requests++;
    return new Response(new ReadableStream({
      pull() { startReading(); },
      cancel() { cancelled = true; return cleanup; }
    }));
  } });
  let settled = false;
  const result = provider.fetchTweet("x.com/suisei_hosimati/status/123", { signal: controller.signal });
  const reason = new Error("job timed out");
  const rejected = assert.rejects(result, (error) => error === reason).finally(() => { settled = true; });
  await reading;
  // Let the provider acquire the reader before cancelling the active body.
  await nextTurn();
  controller.abort(reason);
  await nextTurn();
  assert.equal(cancelled, true);
  assert.equal(settled, false, "capacity cannot return before response cleanup");
  finishCleanup();
  await rejected;
  assert.equal(requests, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("provider deadline covers a real response body stalled after headers", { timeout: 5000 }, async (t) => {
  let closed;
  const connectionClosed = new Promise((resolve) => { closed = resolve; });
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"code":200,');
    response.on("close", closed);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const provider = new FxTwitterProvider({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 1000 });
  await assert.rejects(provider.fetchTweet("suisei_hosimati"), (error) => {
    assert.equal(error.code, "PROVIDER_UNAVAILABLE");
    assert.match(error.message, /超时/);
    return true;
  });
  await connectionClosed;
});

test("provider rejects oversized bodies and closes the response", async () => {
  let cancelled = false;
  const provider = new FxTwitterProvider({ fetchImpl: async () => new Response(new ReadableStream({
    cancel() { cancelled = true; }
  }), { headers: { "content-length": String(4 * 1024 * 1024 + 1) } }) });
  await assert.rejects(provider.fetchTweet("suisei_hosimati"), (error) => error.code === "PROVIDER_UNAVAILABLE" && /过大/.test(error.message));
  assert.equal(cancelled, true);
});

test("provider keeps genuine conversation fallback and removes caller listeners after success", async () => {
  const controller = new AbortController();
  const requests = [];
  const provider = new FxTwitterProvider({ fetchImpl: async (url) => {
    requests.push(url);
    return url.includes("/conversation/")
      ? new Response(JSON.stringify({ code: 404, message: "no conversation" }), { status: 404 })
      : new Response(JSON.stringify(providerPayload()));
  } });
  const result = await provider.fetchTweet("x.com/minatoaqua/status/1383771374183878658", { signal: controller.signal });
  assert.equal(result.tweets.length, 1);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /\/status\/1383771374183878658$/);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);

  const timeline = new FxTwitterProvider({ fetchImpl: async () => new Response(JSON.stringify(timelinePayload())) });
  await timeline.fetchTweet("suisei_hosimati", { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
