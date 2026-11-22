import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// docs/specs/2026-11-22-playwright-csomagolt-chromium.md: a böngészős tesztek a Playwrighthoz rögzített Chromiumon futnak. A gépre
// telepített Google Chrome (`channel: "chrome"`) a Playwright verziójától függetlenül frissül — a Chrome 158 a Playwright 1.57-tel a
// sandboxolt iframe-nél összeomlott, és helyben blokkolta a PR előtti kaput.
// A terv (6. pont) szerint SEMMILYEN `channel` nem állítható: sem más érték (`msedge`, `chrome-beta`), sem számított kifejezés
// (`channel: process.env.X`), sem rövidített tulajdonság (`{ channel }`) — mindegyik a gépre telepített böngészőt választhatná.
export function channelOffenders(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return /(^|[^\w$.])channel\s*:/.test(code) || /[{,]\s*channel\s*[,}]/.test(code) || /["']channel["']\s*:/.test(code);
}

test("egyik Playwright-konfiguráció sem kér böngészőcsatornát (a csomagolt Chromium fut)", () => {
  const dir = new URL("../", import.meta.url);
  const configs = readdirSync(dir).filter((f) => /^playwright.*\.config\.ts$/.test(f));
  assert.ok(configs.length > 0, "van Playwright-konfiguráció");
  const offenders = configs.filter((f) => channelOffenders(readFileSync(new URL(f, dir), "utf8")));
  assert.deepEqual(offenders, [], `a csomagolt Chromium helyett böngészőcsatornát kér: ${offenders.join(", ")}`);
});

test("az őr minden csatorna-alakot elkap, a megjegyzést és a hasonló nevű kulcsot nem", () => {
  for (const bad of [
    `use: { ...devices["Desktop Chrome"], channel: "chrome" }`,
    `use: { channel: 'msedge' }`,
    `use: { channel: process.env.PW_CHANNEL }`,
    `const channel = "chrome"; export default { use: { channel } }`,
    `use: { "channel": "chrome-beta" }`,
  ]) assert.equal(channelOffenders(bad), true, bad);
  for (const ok of [
    `// channel: "chrome" — régi beállítás`,
    `/* channel: 'chrome' */ use: { serviceWorkers: "block" }`,
    `use: { releaseChannel: "x", ...devices["Desktop Chrome"] }`,
  ]) assert.equal(channelOffenders(ok), false, ok);
});
