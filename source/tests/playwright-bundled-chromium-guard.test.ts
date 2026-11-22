import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// docs/specs/2026-11-22-playwright-csomagolt-chromium.md: a böngészős tesztek a Playwrighthoz rögzített Chromiumon futnak. A gépre
// telepített Google Chrome (`channel: "chrome"`) a Playwright verziójától függetlenül frissül — a Chrome 158 a Playwright 1.57-tel a
// sandboxolt iframe-nél összeomlott, és helyben blokkolta a PR előtti kaput.
test("egyik Playwright-konfiguráció sem kéri a gépre telepített Chrome-ot", () => {
  const dir = new URL("../", import.meta.url);
  const configs = readdirSync(dir).filter((f) => /^playwright.*\.config\.ts$/.test(f));
  assert.ok(configs.length > 0, "van Playwright-konfiguráció");
  const offenders = configs.filter((f) => /channel\s*:\s*["']chrome["']/.test(readFileSync(new URL(f, dir), "utf8")));
  assert.deepEqual(offenders, [], `a csomagolt Chromium helyett telepített Chrome-ot kér: ${offenders.join(", ")}`);
});
