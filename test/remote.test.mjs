import assert from "node:assert/strict";
import test from "node:test";
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
