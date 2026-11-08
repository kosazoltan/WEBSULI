import { test } from "node:test";
import assert from "node:assert/strict";
import { blockLabel } from "../shared/lesson-block-label";
import { BAND_THEME } from "../shared/lesson-band";
import type { Block } from "../shared/lesson-schema";

// Spec 2026-11-08-borito-blokkcimkek: a blokkfejléc a tartalomból.
const explain = (text: string, depth: "core" | "deeper" | "why" = "core") => ({ kind: "explain", text, depth, readAloud: false, coversConceptIds: ["c1"] }) as unknown as Block;
const goal = explain("**Cél:** Megérted a harasztok felépítését.\n\n**Tipikus buktató:** …\n\n**Oka:** …\n\n**Leküzdés:** …");
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
  // Review #405: egy sima „Célunk az …” bekezdés nem Célkártya (az stripOpenerGoalLabel-lel összhangban).
  assert.equal(blockLabel([explain("Célunk az egyenlő törtek felismerése.")], 0, 0, "teen"), BAND_THEME.teen.labels.explain);
  // Review #405: „Cél…” kezdetű, többbekezdéses sima magyarázat sem Célkártya (a buktató / ok / leküzdés címkék hiányoznak).
  assert.equal(blockLabel([explain("Célunk az egyenlő törtek felismerése.\n\nA törtek értéke …\n\nPéldául 1/2 = 2/4.")], 0, 0, "teen"), BAND_THEME.teen.labels.explain);
  assert.equal(blockLabel([explain("Célszerű előbb összeadni.\n\nMiért? Mert …\n\nOka: …")], 0, 0, "teen"), BAND_THEME.teen.labels.explain);
  // A kicsik címkéi is felismerhetők.
  const kidGoal = explain("Mit tanulunk ma? Az összeadást.\n\nMi lehet nehéz? A tízes átlépés.\n\nMiért? Sok szám.\n\nÍgy sikerül! Tízre egészítünk.");
  assert.equal(blockLabel([kidGoal, story], 0, 0, "kid", 2), "A lecke célja");
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

// Spec 2026-11-08-tartalmi-fejlecek-2: az ellenőrző kérdés és a záró összefoglaló fejléce a tartalomból.
const check = (question: string) => ({ kind: "check", question, options: ["a", "b"], correctIndex: 0, feedbackPerOption: ["x", "y"], coversConceptIds: ["c1"] }) as unknown as Block;
const recap = () => ({ kind: "recap", bullets: ["x"] }) as unknown as Block;

test("az ellenőrző kérdés fejléce az IQ-formából", () => {
  const cases: Array<[string, string]> = [
    ["Igaz vagy hamis? A harasztok spórával szaporodnak.", "Igaz vagy hamis?"],
    ["Kakukktojás! Melyik nem illik közé: levél, termés, víz, szár?", "Kakukktojás"],
    ["Melyik nem illik a sorba?", "Kakukktojás"],
    ["Találós kérdés: a talajban lakom. Ki vagyok?", "Találós kérdés"],
    ["Analógia: a mohák úgy aránylik … Mi illik a helyére?", "Analógia"],
    ["Sorminta: 1/7, 2/7, 4/7, … Mi a következő elem?", "Sorminta"],
    ["Melyik állítás hamis a harasztokról?", "Melyik hamis?"],
    ["Ha a számlálók szorzata 14, akkor mi a másik tört?", "Következtetés"],
  ];
  for (const [q, label] of cases) assert.equal(blockLabel([check(q)], 0, 1, "teen"), label, q);
  assert.equal(blockLabel([check("Mennyi 3/4 · 2/3?")], 0, 1, "teen"), BAND_THEME.teen.labels.check);
  assert.equal(blockLabel([check("Ha esik. Akkor mi a szorzat?")], 0, 1, "teen"), BAND_THEME.teen.labels.check, "két mondat nem következtetés");
});

test("a lecke utolsó összefoglalója „A lecke tanulsága”, a többi a sáv címkéje", () => {
  const blocks = [explain("x"), recap(), recap()];
  assert.equal(blockLabel(blocks, 2, 4, "teen", 7, true), "A lecke tanulsága");
  assert.equal(blockLabel(blocks, 1, 4, "teen", 7, true), BAND_THEME.teen.labels.recap, "nem az utolsó recap");
  assert.equal(blockLabel(blocks, 2, 2, "teen", 7, false), BAND_THEME.teen.labels.recap, "nem az utolsó fejezet");
  assert.equal(blockLabel(blocks, 2, 4, "teen"), BAND_THEME.teen.labels.recap, "paraméter nélkül a régi viselkedés");
});
