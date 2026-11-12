import test from "node:test";
import { chromium } from "playwright-core";
import { localizationBrowserSuite } from "./localization-browser.mjs";

test("English/Chinese UI, persistence and mobile exports in Chromium", { timeout: 180000 }, async (t) => {
  await localizationBrowserSuite(t, chromium);
});
