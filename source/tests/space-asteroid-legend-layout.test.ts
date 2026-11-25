import assert from "node:assert/strict";
import test from "node:test";

import {
  CRYSTAL_CHIP_HALF_PX,
  LEGEND_BUTTON_PX,
  LEGEND_ITEM_GAP_PX,
  cardBottomPxFor,
  crystalZoneFor,
  legendLayoutFor,
  playQuestionTopPx,
} from "../client/src/lib/spaceAsteroid/crystals";
import { PLAYER_Y_MAX, CAMERA_FOV_DEG, CAMERA_Z } from "../client/src/lib/spaceAsteroid/physics";
import { worldYAtScreenFrac } from "../client/src/lib/spaceAsteroid/crystals";

/**
 * Vak 3. kör L1 — a hosszú, teljes mondatos válaszok jelmagyarázata HELYET FOGLAL: álló nézetben a kártya alatt, a kristály-zóna fölött;
 * fekvőn a kártya mellett, a kártya magasságában. Mért (függőleges) sávok: a jelmagyarázat és a kristály-sorok SOSEM fednek (konstrukció szerint).
 */
void CAMERA_FOV_DEG; void CAMERA_Z;
const PROMPT_LONG = "Melyik állítás igaz a honfoglaló magyarok életmódjára, a törzsszövetségre és a letelepedés körülményeire vonatkozóan?";
const LESSON = [
  "A honfoglaló magyarok félnomád állattartók voltak, és a telet kötött telepeken töltötték el.",
  "A honfoglaló magyarok kizárólag földművelésből éltek, és állandó kőházakban laktak végig az évben.",
  "A törzsszövetséget a mai értelemben vett király vezette, és a törzsek önállóan semmit nem döntöttek.",
  "A magyarok a Kárpát-medencébe a IX. század végén érkeztek a keleti szomszédok felől, több hullámban.",
];
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
] as const;

for (const vp of VIEWPORTS) {
  for (const boxTopPx of [0, 70]) {
    test(`jelmagyarázat-elrendezés ${vp.width}×${vp.height} (doboz teteje ${boxTopPx}): nincs fedés a kártyával és a kristály-sorokkal`, () => {
      for (const prompt of ["Melyik állítás igaz?", PROMPT_LONG]) {
        const boxHeightPx = vp.height - boxTopPx;
        const lay = legendLayoutFor({ labels: LESSON, viewport: vp, safeTopPx: 0, prompt, boxTopPx, boxHeightPx });
        const cardBottom = cardBottomPxFor(vp, 0, prompt);
        const zone = crystalZoneFor({ boxWidthPx: vp.width, boxHeightPx, boxTopPx, viewport: vp, prompt, safeTopPx: 0, reservePx: lay.reservePx });
        if (lay.landscape) {
          assert.equal(lay.reservePx, 0, "fekvőn a jelmagyarázat a kártya mellett áll, nem foglal függőleges helyet");
          assert.ok(lay.topPx + lay.listPx <= cardBottom + 0.5, `a jelmagyarázat alja (${lay.topPx + lay.listPx}) a kártya alja (${cardBottom}) fölött áll`);
        } else {
          const legendBottom = lay.topPx + LEGEND_BUTTON_PX + LEGEND_ITEM_GAP_PX + lay.listPx;
          assert.ok(lay.topPx >= cardBottom, "a jelmagyarázat a kártya alatt kezdődik");
          // a legfelső kristály-gomb teteje a zóna felső pereme (játéksík → képernyő-hányad) mínusz fél gomb
          const topWorld = zone.maxY;
          let lo = 0, hi = 1;
          for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (worldYAtScreenFrac(mid) > topWorld) lo = mid; else hi = mid;
          }
          const chipTopPx = boxTopPx + hi * boxHeightPx - CRYSTAL_CHIP_HALF_PX;
          assert.ok(legendBottom <= chipTopPx - 9, `${vp.width}×${vp.height}: a jelmagyarázat alja (${legendBottom.toFixed(0)}) a legfelső kristály teteje (${chipTopPx.toFixed(0)}) fölött áll`);
        }
        assert.ok(lay.listPx >= 44, "a lista használható magasságú");
        // a jelmagyarázat miatt a zóna nem csúszhat lejjebb a jelmagyarázat nélküli zóna korlátjánál (a doboz 70%-a)
        // (fekvőn a jelmagyarázat nem foglal függőleges helyet — reservePx = 0 —, a sort a kártya és a „Válaszok” gomb közti sáv
        // határozza meg; ezt a „fekvőn a kristály-sor(ok) a kártya ALATT és a gomb FÖLÖTT” teszt méri — review #486, CI 844×390)
        if (!lay.landscape) assert.ok(zone.maxY >= worldYAtScreenFrac(0.7) - 1e-6, "a zóna teteje legfeljebb a doboz 70%-ánál kezdődik");
        void PLAYER_Y_MAX;
      }
    });
  }
}

test("ha a szöveg nem fér a helyre, a lista BELÜL görgethető (nem nő rá a kristályokra)", () => {
  const vp = { width: 360, height: 640 };
  const huge = Array.from({ length: 4 }, () => "Nagyon hosszú, több mondatból álló válasz. ".repeat(6));
  const lay = legendLayoutFor({ labels: huge, viewport: vp, safeTopPx: 0, prompt: PROMPT_LONG, boxTopPx: 0, boxHeightPx: 640 });
  assert.equal(lay.scroll, true);
  assert.ok(lay.listPx <= 640 * 0.28 + 0.5, "a lista magassága korlátos");
});

/** A zóna határa (játéksík y) → képernyő-px a dobozban (bisekció a `worldYAtScreenFrac` fölött). */
function screenPxOf(worldY: number, boxTopPx: number, boxHeightPx: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (worldYAtScreenFrac(mid) > worldY) lo = mid; else hi = mid;
  }
  return boxTopPx + hi * boxHeightPx;
}

test("review #486 (CI 844×390): a kártya becsült teteje a játék saját CSS-e (`--play-question-top` = biztonsági sáv + 96 px)", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../client/src/pages/SpaceAsteroidQuiz.tsx", import.meta.url), "utf8");
  const m = /\.play-question\[data-skin="space"\]\s*\{\s*--play-question-top:\s*calc\(max\(4px, var\(--game-safe-top\)\) \+ (\d+)px\)/.exec(page);
  assert.ok(m, "a space skin kártya-teteje a lapon");
  for (const vp of VIEWPORTS) assert.equal(playQuestionTopPx(vp, 0), 4 + Number(m![1]), `${vp.width}×${vp.height}`);
});

test("review #486 (CI 844×390): fekvőn a kristály-sor(ok) a kártya ALATT és a „Válaszok” gomb FÖLÖTT", () => {
  const vp = { width: 844, height: 390 };
  for (const prompt of ["Melyik állítás igaz?", PROMPT_LONG]) {
    for (const boxTopPx of [0]) {
      const boxHeightPx = vp.height - boxTopPx;
      const zone = crystalZoneFor({ boxWidthPx: vp.width, boxHeightPx, boxTopPx, viewport: vp, prompt, safeTopPx: 0, answersButton: true });
      const upperTop = screenPxOf(zone.maxY, boxTopPx, boxHeightPx) - CRYSTAL_CHIP_HALF_PX;
      const lowerBottom = screenPxOf(zone.minY, boxTopPx, boxHeightPx) + CRYSTAL_CHIP_HALF_PX;
      const buttonTop = vp.height - 8 - LEGEND_BUTTON_PX;
      assert.ok(upperTop >= cardBottomPxFor(vp, 0, prompt), `a felső sor teteje (${upperTop.toFixed(0)}) a kártya alja (${cardBottomPxFor(vp, 0, prompt).toFixed(0)}) alatt`);
      assert.ok(lowerBottom <= buttonTop, `az alsó sor alja (${lowerBottom.toFixed(0)}) a gomb teteje (${buttonTop}) fölött`);
    }
  }
});
