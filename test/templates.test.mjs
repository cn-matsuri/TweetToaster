import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../Matsuri_translation/frontend/templates");

test("bundled template catalog covers and validates every legacy template", async () => {
  const catalog = JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"));
  const files = (await readdir(root)).filter((name) => name.endsWith(".txt")).sort();
  assert.deepEqual(catalog.templates.map((item) => item.file).sort(), files);
  assert.equal(catalog.templates.filter((item) => !item.hidden).length, 49);
  assert.equal(new Set(catalog.templates.map((item) => item.id)).size, catalog.templates.length);

  for (const item of catalog.templates) {
    const source = await readFile(path.join(root, item.file), "utf8");
    assert.ok(source.includes("{T}"), `${item.file} must contain {T}`);
    assert.doesNotMatch(source, /^\uFEFF|\r|https?:\/\/|data:image/i, `${item.file} must be local UTF-8/LF HTML`);
    assert.doesNotMatch(source, /<script|\son[a-z]+\s*=/i, `${item.file} must not contain active content`);
    for (const match of source.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/gi)) {
      assert.match(match[1], /^\/templates\/img\/[A-Za-z0-9_.-]+$/);
      assert.doesNotMatch(match[0], /\sheight=/i, `${item.file} must preserve intrinsic logo size`);
      assert.match(match[0], /max-width:100%;height:auto/i);
      await access(path.join(root, match[1].replace(/^\/templates\//, "")));
    }
  }
});

test("legacy /template URL is served from the bundled /templates library", async () => {
  const { createTweetToasterServer } = await import("../src/app.mjs");
  const { MemoryJobQueue } = await import("../src/jobs.mjs");
  const server = createTweetToasterServer({
    provider: { fetchTweet: async () => ({}) },
    jobs: new MemoryJobQueue(),
    renderBot: async () => "unused"
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/template/matsuri.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    assert.match(await response.text(), /gongfang_official\.png/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
