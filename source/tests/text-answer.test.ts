import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTextAnswer, textAnswerMatches } from "../shared/text-answer";

/**
 * Spec 2026-11-17-szoveges-valasz-irasjel: a begépelt válasz közös összehasonlítója. Tulajdonosi hibajelentés: a mondatvégi pont
 * (vagy a hiánya) nem lehet hiba; az ékezet és a belső írásjel viszont számít.
 */

test("a mondatvégi írásjel, a szélső és többszörös szóköz, a kis- és nagybetű nem számít", () => {
  for (const given of ["Budapest", "Budapest.", " budapest ", "BUDAPEST!!", "budapest?", "Budapest…", "Budapest ...", "Budapest .", "\tBudapest\n"]) {
    assert.equal(textAnswerMatches(given, "Budapest"), true, JSON.stringify(given));
  }
  // Fordítva is: a megoldókulcs végén áll írásjel, a tanuló nem tesz.
  for (const given of ["Budapest", "budapest.", "Budapest!"]) assert.equal(textAnswerMatches(given, "Budapest."), true, JSON.stringify(given));
  assert.equal(textAnswerMatches("zöld  alma", "zöld alma"), true);
  assert.equal(textAnswerMatches("zöld alma.", "zöld alma"), true);
});

test("az ékezet számít, más szó és a belső írásjel is", () => {
  assert.equal(textAnswerMatches("kor", "kór"), false);
  assert.equal(textAnswerMatches("kór", "kor"), false);
  assert.equal(textAnswerMatches("level", "levél"), false);
  assert.equal(textAnswerMatches("Budapesten", "Budapest"), false);
  assert.equal(textAnswerMatches("alma körte", "alma, körte"), false);
  assert.equal(textAnswerMatches("alma, körte.", "alma, körte"), true);
  assert.equal(textAnswerMatches("zöldalma", "zöld alma"), false);
});

test("az üres és a csak írásjelből álló válasz nem helyes", () => {
  for (const given of ["", "   ", ".", "?!", "...", "…", " . ", "\"\"", "''"]) {
    assert.equal(textAnswerMatches(given, "Budapest"), false, JSON.stringify(given));
    assert.equal(normalizeTextAnswer(given), "", JSON.stringify(given));
  }
  assert.equal(textAnswerMatches("", ""), false);
  assert.equal(textAnswerMatches(".", "."), true, "ha a megoldás maga az írásjel, a pontos jel kell");
  assert.equal(textAnswerMatches("?", "."), false);
  assert.equal(textAnswerMatches("", "."), false);
  assert.equal(textAnswerMatches(" ? ", "?"), true);
});

test("tipográfiai változatok: aposztróf, idézőjel, kötőjel, Unicode-alak", () => {
  assert.equal(textAnswerMatches("can’t", "can't"), true);
  assert.equal(textAnswerMatches("can`t.", "can’t"), true);
  assert.equal(textAnswerMatches("cant", "can't"), false, "az aposztróf elhagyása más alak");
  assert.equal(textAnswerMatches("szén–dioxid", "szén-dioxid"), true);
  assert.equal(textAnswerMatches("szén—dioxid", "szén-dioxid"), true);
  assert.equal(textAnswerMatches("szén dioxid", "szén-dioxid"), false);
  assert.equal(textAnswerMatches("„Budapest”", "Budapest"), true);
  assert.equal(textAnswerMatches("\"Budapest.\"", "Budapest"), true);
  assert.equal(textAnswerMatches("'Budapest'.", "Budapest"), true);
  assert.equal(textAnswerMatches("a „nagy” ház", "a \"nagy\" ház"), true);
  assert.equal(textAnswerMatches("a nagy ház", "a „nagy” ház"), false, "a belső idézőjel számít");
  // NFD (betű + kombináló ékezet) = NFC.
  assert.equal(textAnswerMatches("levél", "levél"), true);
  assert.equal(textAnswerMatches("őz", "őz"), true);
  assert.equal(textAnswerMatches("Őz.", "őz"), true);
});

test("szám alakú megoldás: tizedesvessző = tizedespont, a záró pont nem számít, az érték igen", () => {
  assert.equal(textAnswerMatches("3.5", "3,5"), true);
  assert.equal(textAnswerMatches("3,5.", "3,5"), true);
  assert.equal(textAnswerMatches("3,5", "3.5"), true);
  assert.equal(textAnswerMatches("12.", "12"), true);
  assert.equal(textAnswerMatches("12", "12."), true);
  assert.equal(textAnswerMatches("+12", "12"), true);
  assert.equal(textAnswerMatches("−4", "-4"), true);
  assert.equal(textAnswerMatches("120", "12"), false);
  assert.equal(textAnswerMatches("1.2", "12"), false);
  assert.equal(textAnswerMatches("3,50", "3,5"), false, "a kért alak számít");
  assert.equal(textAnswerMatches("tizenkettő", "12"), false);
  assert.equal(textAnswerMatches("-12", "12"), false);
});

test("rövidítés és több elfogadott válasz", () => {
  assert.equal(textAnswerMatches("dr", "Dr."), true);
  assert.equal(textAnswerMatches("stb.", "stb"), true);
  assert.equal(textAnswerMatches("pl.", "pl."), true);
  assert.equal(textAnswerMatches("autó.", ["kocsi", "autó", "gépkocsi"]), true);
  assert.equal(textAnswerMatches("Kocsi", ["kocsi", "autó"]), true);
  assert.equal(textAnswerMatches("busz", ["kocsi", "autó"]), false);
  assert.equal(textAnswerMatches("autó", []), false);
});

test("a normalizált alak: kisbetű, egy szóköz, záró írásjel nélkül; a belső írásjel marad", () => {
  assert.equal(normalizeTextAnswer("  Szép   IDŐ van,  ugye?! "), "szép idő van, ugye");
  assert.equal(normalizeTextAnswer("3,5."), "3,5");
  assert.equal(normalizeTextAnswer("u.i."), "u.i");
  // Review #348 elve: lookbehind nélkül (a régebbi Safari az ilyen szkriptet be sem tölti).
  for (const fn of [normalizeTextAnswer, textAnswerMatches]) assert.doesNotMatch(fn.toString(), /\(\?<[=!]/);
});
