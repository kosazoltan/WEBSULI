import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveStudioModel } from "../server/ai/models";
import { keyTokenRecall, normalizeForRecall } from "../server/studio/ocr-recall";

/**
 * #190 — az OCR-modell választását MÉRT szám indokolja. Ez a teszt a rögzített
 * átiratokból számol újra, hálózat és API-kulcs nélkül, így a szám nem egy
 * commit-üzenetbeli állítás marad, hanem újrafuttatható tény.
 *
 * A mérés HÁROM saját hibán ment át — mindhármat a normalizáló őrzi most:
 *   1. a `·` szorzásjel és a `T₁` alsó index kezeletlen volt  -> 76% a valós 88% helyett,
 *   2. a modell nevére illesztés („olcsó") bizonyíték helyett  -> mért árlista lett,
 *   3. a `|` alternációt szó szerint kereste                   -> 52% a valós 93% helyett,
 *      ami a modell-RANGSORT is felcserélte volna.
 */

type Fixture = {
  pages: Record<string, { tema: string; keyTokens: string[] }>;
  transcripts: Record<string, Record<string, string>>;
  measured: Record<string, number>;
};

const fx: Fixture = JSON.parse(
  readFileSync(new URL("./fixtures/ocr-handwriting.json", import.meta.url), "utf8"),
);
const PAGES = Object.keys(fx.pages);

const meanRecall = (model: string): number =>
  PAGES.reduce(
    (sum, p) => sum + keyTokenRecall(fx.transcripts[model][p], fx.pages[p].keyTokens).recall,
    0,
  ) / PAGES.length;

test("a normalizálás kezeli a magyar matek-kézírás jelöléseit", () => {
  // 1. hiba: e két sor miatt számolt a mérő HELYES választ hibának.
  assert.ok(normalizeForRecall("a·ma / 2").includes("ama"), "a · szorzásjel nem választhat el");
  assert.ok(normalizeForRecall("T₁").includes("t1"), "az alsó index bomoljon ki");
  assert.ok(normalizeForRecall("r²").includes("r2"), "a felső index bomoljon ki");
  assert.equal(normalizeForRecall("π"), "pi");
  assert.ok(normalizeForRecall("0,215").includes("0.215"), "magyar tizedesvessző");
  assert.equal(normalizeForRecall("Terület"), normalizeForRecall("terulet"), "ékezet-tűrés");
});

test("a '|' alternatívákat jelöl, nem szó szerinti szöveget", () => {
  // 3. hiba: ez a kör buktatta volna a rangsort.
  const { recall, missing } = keyTokenRecall("a kör átmérője d = 2r", ["2r|2*r|2 r", "d=2r|d = 2r"]);
  assert.equal(recall, 1, `alternatíva nem talált: ${missing.join(", ")}`);
});

test("hiányzó tokent nem néz el (negatív kontroll)", () => {
  const { recall, missing } = keyTokenRecall("csak ennyi", ["trapez|Tr", "tizedestort"]);
  assert.equal(recall, 0);
  assert.deepEqual(missing, ["trapez|Tr", "tizedestort"]);
});

test("a beállított OCR-modell a mért mezőny legjobbja", () => {
  const configured = resolveStudioModel("ocr");
  const ranked = Object.keys(fx.transcripts).sort((a, b) => meanRecall(b) - meanRecall(a));
  assert.equal(
    configured,
    ranked[0],
    `a beállított modell (${configured}) nem a legjobb; mért sorrend: ${ranked
      .map((m) => `${m}=${(meanRecall(m) * 100).toFixed(1)}%`)
      .join(", ")}`,
  );
});

test("az OCR-modell verte a leváltott glm-et, és nem csúszik vissza alá", () => {
  const now = meanRecall(resolveStudioModel("ocr"));
  const old = meanRecall("z-ai/glm-5.3-flash");
  assert.ok(now > old, `a váltásnak nyernie kell: ${now.toFixed(3)} vs ${old.toFixed(3)}`);
  // A rögzített 92,6% NEM éri el a #190 célját (>=95%) — a küszöb a MÉRT
  // értéket őrzi a visszacsúszástól, nem a vágyott célt állítja késznek.
  assert.ok(now >= 0.9, `visszaesés a mért 92,6%-ról: ${(now * 100).toFixed(1)}%`);
});

test("a fixture rögzített pontszámai megegyeznek az újraszámolttal", () => {
  for (const [model, expected] of Object.entries(fx.measured)) {
    assert.ok(
      Math.abs(meanRecall(model) - expected) < 0.005,
      `${model}: fixture ${expected} vs újraszámolt ${meanRecall(model).toFixed(4)}`,
    );
  }
});
