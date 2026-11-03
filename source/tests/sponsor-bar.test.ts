import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { SPONSORS } from "../shared/sponsors";

// Spec 2026-11-03-szponzor-fejlec: a két támogató logója a cég honlapjára visz, új lapon, szponzorált linkként.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a két támogató: https honlap, létező 2× logófájl", () => {
  assert.deepEqual(SPONSORS.map((s) => s.name), ["Exclusive Change", "Expressz Zálog"]);
  assert.deepEqual(SPONSORS.map((s) => s.url), ["https://www.excbestchange.hu/hu/", "https://www.expresszzalog.hu/hu/"]);
  for (const s of SPONSORS) {
    assert.ok(existsSync(new URL(`../client/public${s.logo}`, import.meta.url)), s.logo);
    assert.equal(s.height, 96, "2× felbontás a 48 px alatti megjelenítéshez");
  }
});

test("a logó link új lapon, sponsored rel-lel, elérhető névvel; a főoldal beköti a sávot", () => {
  const bar = read("client/src/components/SponsorBar.tsx");
  assert.match(bar, /target="_blank"/);
  assert.match(bar, /rel="noopener noreferrer sponsored"/);
  assert.match(bar, /aria-label=\{`\$\{s\.name\} honlapja \(új lapon nyílik\)`\}/);
  assert.match(bar, /alt=\{s\.name\}/);
  assert.match(bar, /aria-label="Támogatóink"/);
  const list = read("client/src/components/UserFileList.tsx");
  assert.ok(list.indexOf("<SponsorBar />") > list.indexOf("<HeroSection"), "a fejléc után");
  assert.ok(list.indexOf("<SponsorBar />") < list.indexOf("<WelcomeCard"), "az üdvözlő kártya előtt");
});
