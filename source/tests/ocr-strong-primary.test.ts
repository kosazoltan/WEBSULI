import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OCR_THIRD_READER_MODEL, resolveStudioModel } from "../server/ai/models";
import { ROLE_SKILLS } from "../server/studio/role-skills";

/* Spec 2026-10-05-s11/5 (tulajdonosi döntés a 8. élő futás után): a studió forrás-OCR-jében az erős olvasó olvas elsőként és dönt
   vitában; a konfigurált (mért) OCR-modell a független második; harmadik szavazó nincs. A konfigurált OCR-modell nem változik. */

const src = readFileSync(new URL("../server/studio/run-extraction.ts", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export async function createCachedSourceOcr"));

test("S11/5: az erős olvasó az első és a döntő, a konfigurált OCR-modell a második, harmadik szavazó nélkül", () => {
  assert.notEqual(OCR_THIRD_READER_MODEL, resolveStudioModel("ocr"), "az erős olvasó külön modell");
  assert.match(body, /dualReadOcr\(strong, first, \(file, text, disputes\) => callOcrAdjudicator\(file, thirdModel, text, disputes\), undefined, guard, \{ adjudicatorDecides: true \}\)/);
  const strongAt = body.indexOf("if (strongReady && thirdModel !== ocrModel)");
  const singleAt = body.indexOf("if (!secondModel || secondModel === ocrModel");
  assert.ok(strongAt > 0 && strongAt < singleAt, "az erős-első ág a második olvasó hiánya esetén is él (a korai visszatérés előtt)");
  assert.match(body, /dual-strong-adj/, "saját gyorsítótár-kulcs (a régi átiratok nem keverednek)");
});

test("S11/5: az OCR-skill nem írja át a lap márka-/gyártó-feliratát", () => {
  assert.match(ROLE_SKILLS.ocr, /márka-, gyártó- vagy füzetcég-felirat/);
});

test("S11/5 (mért, 9. mérés): a döntő olvasás az erős olvasatot választja → nincs jel; saját harmadik alak → jel", async () => {
  const { locateOcrDisagreements, markUnresolvedDisputes, UNCERTAIN_MARK } = await import("../server/studio/ocr");
  const strong = "Ázsia, Közel - Kelet térsége\nlépcsőzetes toronytemplom: zikkurat\n1. élén: papkirályok\n2. Előkelők: papok és katonák";
  const weak = "Téma: Föld - Föld. térség\nLegnagyobb toronytemplom: zikkurat\nélén: papságiak\nelőkelők: papok és határak";
  const located = locateOcrDisagreements(strong, weak);
  assert.ok(located.length >= 4, "valódi viták");
  assert.ok(markUnresolvedDisputes(strong, located, strong).includes(UNCERTAIN_MARK), "a régi szabály jelölne");
  assert.equal(markUnresolvedDisputes(strong, located, strong, { thirdFormOnly: true }), strong, "a döntő olvasás dönt: nincs jel");
  const third = strong.replace("papkirályok", "papkirálynők");
  assert.match(markUnresolvedDisputes(third, located, strong, { thirdFormOnly: true }), /papkirálynők⟦\?⟧/, "saját, egyik olvasattal sem egyező alak jelölt");
});
