import { test } from "node:test";
import assert from "node:assert/strict";
import { blockLabel } from "../shared/lesson-block-label";
import { BAND_THEME } from "../shared/lesson-band";
import type { Block } from "../shared/lesson-schema";

// Spec 2026-11-08-borito-blokkcimkek: a blokkfejléc a tartalomból.
const explain = (text: string, depth: "core" | "deeper" | "why" = "core") => ({ kind: "explain", text, depth, readAloud: false, coversConceptIds: ["c1"] }) as unknown as Block;
const goal = explain("**Cél:** Megérted a harasztok felépítését.\n\n**Tipikus buktató:** …");
const story = explain("Dóra a kertben harasztot talált. … Vajon miért nincs virága?");
const anim = (animKind: string) => ({ kind: "animate", animKind, params: {}, caption: "x", coversConceptIds: ["c1"] }) as unknown as Block;
const tryB = (tryKind: string) => ({ kind: "try", tryKind, spec: {}, coversConceptIds: ["c1"] }) as unknown as Block;

test("Célkártya és mese az 1. fejezet elején", () => {
  const blocks = [goal, story, explain("A harasztok szövetes növények.")];
  assert.equal(blockLabel(blocks, 0, 0, "senior"), "A lecke célja");
  assert.equal(blockLabel(blocks, 1, 0, "senior"), "Történet");
  assert.equal(blockLabel(blocks, 1, 0, "kid"), "Mese");
  // Review #405: a „Mese” csak 1–4. évfolyamon — a programozás (0) a kid sávba esik, de „Történet”.
  assert.equal(blockLabel(blocks, 1, 0, "kid", 3), "Mese");
  assert.equal(blockLabel(blocks, 1, 0, "kid", 0), "Történet");
  assert.equal(blockLabel(blocks, 2, 0, "senior"), BAND_THEME.senior.labels.explain);
});

test("másik fejezetben és Célkártya nélkül a sáv címkéje marad", () => {
  assert.equal(blockLabel([goal, story], 0, 1, "teen"), BAND_THEME.teen.labels.explain);
  assert.equal(blockLabel([explain("Az oszthatóság alapja."), story], 0, 0, "teen"), BAND_THEME.teen.labels.explain);
  assert.equal(blockLabel([explain("Az oszthatóság alapja."), story], 1, 0, "teen"), BAND_THEME.teen.labels.explain);
  assert.equal(blockLabel([explain("Célszerű előbb összeadni.")], 0, 0, "teen"), BAND_THEME.teen.labels.explain, "a „Célszerű” nem célcímke");
});

test("mélység, ábra- és feladatfajta szerinti címkék", () => {
  assert.equal(blockLabel([explain("x", "why")], 0, 2, "teen"), "Miért?");
  assert.equal(blockLabel([explain("x", "deeper")], 0, 2, "teen"), "Mélyebben");
  assert.equal(blockLabel([anim("cycle")], 0, 1, "teen"), "Körforgás");
  assert.equal(blockLabel([anim("scene3d")], 0, 1, "teen"), "3D-modell");
  assert.equal(blockLabel([anim("ismeretlen")], 0, 1, "teen"), "Ábra");
  assert.equal(blockLabel([tryB("match")], 0, 1, "teen"), "Párosítsd");
  assert.equal(blockLabel([tryB("ismeretlen")], 0, 1, "teen"), "Próbáld ki");
});
