import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

// S4b (docs/specs/2026-10-16-egy-futas.md): a lépésenkénti OCR-modell (resolveStudioModel("ocr")) kivezetve — a beállított OCR-modell két esete törölve.

test("a fixture rögzített pontszámai megegyeznek az újraszámolttal", () => {
  for (const [model, expected] of Object.entries(fx.measured)) {
    assert.ok(
      Math.abs(meanRecall(model) - expected) < 0.005,
      `${model}: fixture ${expected} vs újraszámolt ${meanRecall(model).toFixed(4)}`,
    );
  }
});
