import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../Matsuri_translation/frontend/i18n.js", import.meta.url), "utf8");
const frontend = await readFile(new URL("../Matsuri_translation/frontend/api3.js", import.meta.url), "utf8");
const html = await readFile(new URL("../Matsuri_translation/frontend/index.html", import.meta.url), "utf8");

function catalog({ saved, languages = ["en-US"], blocked = false } = {}) {
  const store = new Map(saved ? [["tweetToaster.language.v1", saved]] : []);
  const events = [];
  const window = { dispatchEvent: (event) => events.push(event) };
  const document = { querySelectorAll: () => [], querySelector: () => null, documentElement: {} };
  const localStorage = {
    getItem(key) { if (blocked) throw new Error("Storage unavailable"); return store.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error("Storage unavailable"); store.set(key, value); }
  };
  vm.runInNewContext(source, { window, document, localStorage, navigator: { languages }, CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  } });
  return { api: window.TweetToasterI18n, document, store, events };
}

test("all static and literal runtime localization keys have complete paired translations", () => {
  const { api } = catalog();
  const keys = Object.keys(api.messages.en);
  assert.ok(keys.length > 100);
  assert.deepEqual(keys, Object.keys(api.messages.zh));
  for (const key of keys) {
    for (const language of ["en", "zh"]) {
      assert.equal(typeof api.messages[language][key], "string", `${language}:${key}`);
      assert.ok(api.messages[language][key].trim(), `${language}:${key}`);
    }
  }
  const referenced = [
    ...[...frontend.matchAll(/\b(?:t|message|localError)\("([^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((match) => match[1].split(";").map((entry) => entry.split(":")[1]))
  ];
  for (const key of referenced) assert.ok(keys.includes(key), `missing localization key ${key}`);
});

test("language detection and storage fallback preserve explicit choices without changing other preferences", () => {
  assert.equal(catalog({ languages: ["zh-TW", "en-US"] }).api.getLanguage(), "zh");
  assert.equal(catalog({ languages: ["en-GB", "zh-CN"] }).api.getLanguage(), "en");
  assert.equal(catalog({ languages: ["ja-JP", "zh-CN"] }).api.getLanguage(), "zh");
  assert.equal(catalog({ languages: ["ja-JP"] }).api.getLanguage(), "en");
  const saved = catalog({ saved: "zh", languages: ["en-US"] });
  assert.equal(saved.api.getLanguage(), "zh");
  assert.equal(saved.api.setLanguage("en"), true);
  assert.equal(saved.store.get("tweetToaster.language.v1"), "en");
  assert.equal(saved.events.length, 1);
  assert.equal(saved.api.setLanguage("invalid"), false);
  assert.equal(saved.api.getLanguage(), "en");
  const blocked = catalog({ blocked: true });
  assert.doesNotThrow(() => blocked.api.setLanguage("zh"));
  assert.equal(blocked.api.getLanguage(), "zh");
  assert.equal(blocked.document.documentElement.lang, "zh-CN");
});

test("interpolation keeps user text and template tokens literal and errors follow selected language", () => {
  const { api } = catalog();
  const name = '<img src=x onerror="alert(1)"> 中文';
  assert.equal(api.t("assets.current", { name }), `Current · ${name}`);
  assert.match(api.t("template.missingToken"), /\{T\}/);
  assert.match(api.error({ code: "PROVIDER_UNAVAILABLE", message: "中文后端错误" }), /[a-z]/i);
  assert.doesNotMatch(api.error({ code: "PROVIDER_UNAVAILABLE", message: "中文后端错误" }), /[\u4e00-\u9fff]/);
  api.setLanguage("zh");
  assert.match(api.error({ code: "PROVIDER_UNAVAILABLE" }), /[\u4e00-\u9fff]/);
  assert.equal(api.getLocale(), "zh-CN");
});
