import test from "node:test";
import { webkit } from "playwright-core";
import { localizationBrowserSuite } from "./localization-browser.mjs";

// Run explicitly with pnpm test:webkit. Missing WebKit is a failure, not a skip.
test("WebKit desktop and iPhone-sized English/Chinese workflows", { timeout: 180000 }, async (t) => {
  await localizationBrowserSuite(t, webkit);
});
