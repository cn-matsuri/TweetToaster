import assert from "node:assert/strict";
import test from "node:test";
import dns from "node:dns/promises";
import { getEventListeners } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";
import { fetchImage, fetchTemplate } from "../src/remote.mjs";

test("remote template enforces declared and streamed size limits", async () => {
  await assert.rejects(
    () => fetchTemplate("https://1.1.1.1/template.txt", {
      maxBytes: 4,
      allowedTemplateHosts: new Set(["1.1.1.1"]),
      fetchImpl: async () => new Response("12345", { headers: { "content-length": "5" } })
    }),
    /文件过大/
  );
});

test("media proxy only accepts known image hosts and image content", async () => {
  await assert.rejects(() => fetchImage("https://example.com/image.png"), /图片来源/);
  await assert.rejects(
    () => fetchImage("https://pbs.twimg.com/image.png", {
      fetchImpl: async () => new Response("not an image", { headers: { "content-type": "text/plain" } })
    }),
    /不是图片/
  );
});

test("remote templates require an explicit trusted host", async () => {
  await assert.rejects(() => fetchTemplate("https://example.com/template.txt"), /模板来源/);
});

test("cancelled remote requests never start a download", async () => {
  const reason = new Error("cancelled job");
  let calls = 0;
  const options = { signal: AbortSignal.abort(reason), fetchImpl: async () => { calls++; } };
  await assert.rejects(fetchTemplate("https://raw.githubusercontent.com/template.txt", options), (error) => error === reason);
  await assert.rejects(fetchImage("https://pbs.twimg.com/image.png", options), (error) => error === reason);
  assert.equal(calls, 0);
});

test("remote cancellation closes an active streamed body before settling", async () => {
  for (const kind of ["image", "template"]) {
    const controller = new AbortController();
    let reading;
    const started = new Promise((resolve) => { reading = resolve; });
    let finishCleanup;
    const cleanup = new Promise((resolve) => { finishCleanup = resolve; });
    let cancelled = false;
    const options = {
      signal: controller.signal,
      allowedTemplateHosts: new Set(["1.1.1.1"]),
      fetchImpl: async () => new Response(new ReadableStream({
        pull() { reading(); },
        cancel() { cancelled = true; return cleanup; }
      }), { headers: { "content-type": "image/png" } })
    };
    const promise = kind === "image"
      ? fetchImage("https://pbs.twimg.com/image.png", options)
      : fetchTemplate("https://1.1.1.1/template.txt", options);
    const reason = new Error("job timed out");
    let settled = false;
    const rejected = assert.rejects(promise, (error) => error === reason).finally(() => { settled = true; });
    await started;
    await nextTurn();
    controller.abort(reason);
    await nextTurn();
    assert.equal(cancelled, true, kind);
    assert.equal(settled, false, kind);
    finishCleanup();
    await rejected;
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  }
});

test("remote deadlines remain active until the response body finishes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let started;
  const reading = new Promise((resolve) => { started = resolve; });
  let cancelled = false;
  const result = fetchImage("https://pbs.twimg.com/image.png", {
    fetchImpl: async () => new Response(new ReadableStream({
      pull() { started(); },
      cancel() { cancelled = true; }
    }), { headers: { "content-type": "image/png" } })
  });
  const rejected = assert.rejects(result, (error) => error.name === "TimeoutError");
  await reading;
  await nextTurn();
  t.mock.timers.tick(15000);
  await rejected;
  assert.equal(cancelled, true);
});

test("remote errors and streamed size limits cancel rejected bodies", async () => {
  for (const condition of ["status", "type", "declared-size", "streamed-size"]) {
    let cancelled = false;
    const headers = { "content-type": condition === "type" ? "text/plain" : "image/png" };
    if (condition === "declared-size") headers["content-length"] = "5";
    await assert.rejects(fetchImage("https://pbs.twimg.com/image.png", {
      maxBytes: 4,
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(5)); },
        cancel() { cancelled = true; }
      }), { status: condition === "status" ? 404 : 200, headers })
    }));
    assert.equal(cancelled, true, condition);
  }
});

test("cancellation during OS DNS lookup waits for it and cannot start a later fetch", async (t) => {
  let resolveLookup;
  let started;
  const lookingUp = new Promise((resolve) => { started = resolve; });
  t.mock.method(dns, "lookup", () => {
    started();
    return new Promise((resolve) => { resolveLookup = resolve; });
  });
  const controller = new AbortController();
  let fetched = false;
  const reason = new Error("job cancelled during DNS");
  const request = fetchTemplate("https://raw.githubusercontent.com/template.txt", {
    signal: controller.signal,
    fetchImpl: async () => { fetched = true; return new Response("template"); }
  });
  let settled = false;
  const rejected = assert.rejects(request, (error) => error === reason).finally(() => { settled = true; });
  await lookingUp;
  controller.abort(reason);
  await nextTurn();
  assert.equal(settled, false, "uncancellable OS work must remain accounted for");
  resolveLookup([{ address: "1.1.1.1", family: 4 }]);
  await rejected;
  assert.equal(fetched, false);
});

test("remote template validation still rejects private DNS results", async (t) => {
  t.mock.method(dns, "lookup", async () => [{ address: "127.0.0.1", family: 4 }]);
  let fetched = false;
  await assert.rejects(fetchTemplate("https://raw.githubusercontent.com/template.txt", {
    fetchImpl: async () => { fetched = true; return new Response("template"); }
  }), /内网/);
  assert.equal(fetched, false);
});
