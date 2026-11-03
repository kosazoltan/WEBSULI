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

// Spec 2026-11-03-hero-szponzor-2026: az Exclusive Change logója a piros alapú, fekete négyzetes ikonos (széles) változat; a fejléc
// gombjai egy rendszerben (közös `hero-btn`, egyforma 46 px).
test("a logófájlok valós mérete egyezik a SPONSORS-szal; az Exclusive a piros, széles változat", async () => {
  const { default: sharp } = await import("sharp");
  for (const s of SPONSORS) {
    const meta = await sharp(readFileSync(new URL(`../client/public${s.logo}`, import.meta.url))).metadata();
    assert.deepEqual([meta.width, meta.height], [s.width, s.height], s.id);
  }
  const exc = SPONSORS.find((s) => s.id === "exclusive-change")!;
  assert.ok(exc.width / exc.height > 3.2, "a piros változat képaránya ≈3,43:1");
  // Review #388: nem egyetlen képpont — a háttér túlnyomóan piros, a bal harmadban ott a fekete négyzetes ikon, a jobb kétharmadban
  // a fehér felirat.
  const { data, info } = await sharp(readFileSync(new URL(`../client/public${exc.logo}`, import.meta.url))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const share = (x0: number, x1: number, test: (r: number, g: number, b: number) => boolean) => {
    let hit = 0, all = 0;
    for (let y = 0; y < info.height; y++) for (let x = Math.floor(x0 * info.width); x < Math.floor(x1 * info.width); x++) {
      const i = (y * info.width + x) * 3;
      all++;
      if (test(data[i], data[i + 1], data[i + 2])) hit++;
    }
    return hit / all;
  };
  const red = (r: number, g: number, b: number) => r > 200 && g < 90 && b < 90;
  const black = (r: number, g: number, b: number) => r < 70 && g < 70 && b < 70;
  const white = (r: number, g: number, b: number) => r > 220 && g > 220 && b > 220;
  assert.ok(share(0, 1, red) > 0.5, `a háttér piros (${share(0, 1, red).toFixed(2)})`);
  assert.ok(share(0, 0.3, black) > 0.25, `a bal harmadban a fekete négyzetes ikon (${share(0, 0.3, black).toFixed(2)})`);
  assert.ok(share(0.3, 1, black) < 0.02, "a felirat része nem fekete");
  assert.ok(share(0.3, 1, white) > 0.1, `a jobb oldalon fehér felirat (${share(0.3, 1, white).toFixed(2)})`);
});

test("a fejléc minden gombja a közös hero-btn rendszert használja", () => {
  const hero = read("client/src/components/HeroSection.tsx");
  const buttons = hero.match(/<Button[\s\S]*?>/g) ?? [];
  assert.ok(buttons.length >= 4);
  for (const b of buttons) assert.match(b, /className="hero-btn hero-btn--/, b);
  assert.match(read("client/src/components/EmailSubscribeDialog.tsx"), /className="hero-btn hero-btn--notify"/);
  assert.match(read("client/src/index.css"), /\.hero-bar \.hero-btn \{[^}]*height: 46px;/);
});
