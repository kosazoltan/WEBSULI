import assert from "node:assert/strict";
import test from "node:test";

import {
  CRYSTAL_CHIP_HALF_PX,
  LEGEND_BUTTON_PX,
  LEGEND_ITEM_GAP_PX,
  cardBottomPxFor,
  crystalZoneFor,
  legendLayoutFor,
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
        assert.ok(zone.maxY >= worldYAtScreenFrac(0.7) - 1e-6, "a zóna teteje legfeljebb a doboz 70%-ánál kezdődik");
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
