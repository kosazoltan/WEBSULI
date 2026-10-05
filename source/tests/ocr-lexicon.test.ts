import test from "node:test";
import assert from "node:assert/strict";
import { decideNonWordLines, dualReadOcr, lexiconGuardedOcr, parseStrongLines, verifyNonWords, withOcrCache, UNCERTAIN_MARK, type StrongLineRequest } from "../server/studio/ocr";
import { loadHungarianLexicon, nonWordLines } from "../server/studio/ocr-lexicon";
import { ROLE_SKILLS } from "../server/studio/role-skills";
import type { ExtractorFile } from "../server/studio/extractor";

/* Spec 2026-10-05-s11/4 — egyező félreolvasás: szótár-őr + célzott erős olvasás (mért: map b6647e0c, „Kesia, Föld - Felt. térsége”). */

const file = { name: "fuzet.jpg", kind: "image", content: "data:image/jpeg;base64,AA" } as ExtractorFile;
const KNOWN = new Set([
  "mezopotámia", "folyóköz", "föld", "térsége", "ázsia", "közel", "kelet", "közel-kelet", "toronytemplom", "lépcsőzetes",
  "parasztok", "kézművesek", "élén", "király", "állt", "zikkurat", "öntözéses", "földművelés", "társadalom",
]);
const isWord = (w: string) => KNOWN.has(w.toLowerCase());
const MEASURED = "Mezopotámia: folyóköz\nKesia, Föld - Felt. térsége\nLepesztető toronytemplom\nParasztok és kézművesek";
const mark = UNCERTAIN_MARK.replace(/[?]/g, "\\?");

test("nonWordLines: a mért zagyva sorok jelöltek (sorszámmal), a szám, rövidítés, rövid szó, ⟦?⟧ és [KERET…] kivétel", () => {
  const lines = nonWordLines(MEASURED, isWord);
  assert.deepEqual(lines.map((l) => [l.line, l.words]), [[2, ["Kesia", "Felt"]], [3, ["Lepesztető"]]]);
  assert.deepEqual(nonWordLines("[KERET: társadalom]\nKr. e. 3000 pl. stb. kb. az és\nKesia⟦?⟧ térsége\nIII. király", isWord), []);
  assert.deepEqual(nonWordLines("Közel-Kelet térsége", (w) => w !== "Közel-Kelet" && isWord(w)), [], "kötőjeles szó részenként is próbálva");
});

test("nonWordLines: idegen nyelvű szöveg (> 40 % nem-szó) → üres lista", () => {
  assert.deepEqual(nonWordLines("The river valley between Tigris and Euphrates was called Mesopotamia by the Greeks", isWord), []);
});

test("Kesia-sor: az erős olvasat szótár-helyes és eltér → csere (csak az a sor), a kérdéses olvasat nem kerül a kérésbe", async () => {
  const seen: StrongLineRequest[][] = [];
  const out = await verifyNonWords(MEASURED, file, async (_f, lines) => {
    seen.push(lines);
    return new Map([[2, "Ázsia, Közel-Kelet térsége"], [3, "Lépcsőzetes toronytemplom"]]);
  }, isWord);
  assert.equal(out, "Mezopotámia: folyóköz\nÁzsia, Közel-Kelet térsége\nLépcsőzetes toronytemplom\nParasztok és kézművesek");
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].map((l) => l.n), [2, 3]);
  const request = JSON.stringify(seen[0]);
  assert.doesNotMatch(request, /Kesia|Felt|Lepesztető/, "a kérdéses sorok alap-olvasata nem horgonyoz");
  assert.match(request, /Mezopotámia: folyóköz/, "a jó szomszéd sor a helyet adja");
});

test("az erős olvasat is nem-szó (vagy az erős olvasó hibázik / hiányzik) → ⟦?⟧ a kérdéses szó után", async () => {
  const both = await verifyNonWords(MEASURED, file, async () => new Map([[2, "Kezia, Föld - Felt. térsége"], [3, "Lepcsezető toronytemplom"]]), isWord);
  assert.match(both, new RegExp(`Kesia${mark}, Föld - Felt${mark}\\. térsége`), "eltérő sorban minden kérdéses szó jelölt (a részben egyező is)");
  assert.match(both, new RegExp(`Lepesztető${mark} toronytemplom`));
  const failing = await verifyNonWords(MEASURED, file, async () => { throw new Error("időtúllépés"); }, isWord);
  assert.match(failing, new RegExp(`Kesia${mark}`));
  assert.match(failing, new RegExp(`Lepesztető${mark}`));
  const missing = await verifyNonWords(MEASURED, file, undefined, isWord);
  assert.match(missing, new RegExp(`Felt${mark}`));
  assert.doesNotMatch(missing, /Mezopotámia⟦|kézművesek⟦/, "a jó sorok érintetlenek");
});

test("„sumérok”: a szótár nem ismeri, az erős olvasó megerősíti → jel nélkül marad", async () => {
  const text = "A sumérok földművelés\nzikkurat";
  let calls = 0;
  const out = await verifyNonWords(text, file, async () => { calls++; return new Map([[1, "A sumérok földművelés"]]); }, isWord);
  assert.equal(calls, 1);
  assert.equal(out, text);
});

test("eltérő, szótár-helyes, de más sort olvasó erős olvasat nem cserél (a jó szavak egyike sem közös) → ⟦?⟧", () => {
  const lines = nonWordLines("Kesia, Föld - Felt. térsége", isWord);
  const out = decideNonWordLines("Kesia, Föld - Felt. térsége", lines, new Map([[1, "Parasztok és kézművesek"]]), isWord);
  assert.equal(out.replaced.length, 0);
  assert.match(out.text, new RegExp(`Kesia${mark}`));
});

test("tiszta szöveg → 0 erős hívás (a dualReadOcr-ben sem)", async () => {
  let strongCalls = 0;
  const strongLines = async () => { strongCalls++; return new Map<number, string>(); };
  assert.equal(await verifyNonWords("Mezopotámia: folyóköz\nParasztok és kézművesek", file, strongLines, isWord), "Mezopotámia: folyóköz\nParasztok és kézművesek");
  const clean = dualReadOcr(async () => "Parasztok és kézművesek", async () => "Parasztok és kézművesek", async (_f, f) => f, undefined, { lexicon: async () => isWord, strongLines });
  assert.equal(await clean(file), "Parasztok és kézművesek");
  assert.equal(strongCalls, 0);
});

test("dualReadOcr: a két alap-olvasó UGYANAZT a nem-szót olvassa → az erős olvasó újraolvassa a sort és cserél", async () => {
  let strongCalls = 0;
  const ocr = dualReadOcr(async () => MEASURED, async () => MEASURED, async () => { throw new Error("nem hívható"); }, undefined, {
    lexicon: async () => isWord,
    strongLines: async () => { strongCalls++; return new Map([[2, "Ázsia, Közel-Kelet térsége"]]); },
  });
  const out = await ocr(file);
  assert.equal(strongCalls, 1);
  assert.match(out, /Ázsia, Közel-Kelet térsége/);
  assert.doesNotMatch(out, /Kesia/);
  assert.match(out, new RegExp(`Lepesztető${mark}`), "a meg nem erősített sor jelölt");
  assert.equal(ocr.degraded(file), false);
});

test("szótár-betöltési hiba → változatlan átirat, degraded (nem cache-elhető); guard nélkül a régi út", async () => {
  const ocr = dualReadOcr(async () => MEASURED, async () => MEASURED, async (_f, f) => f, undefined, { lexicon: async () => null, strongLines: async () => { throw new Error("nem hívható"); } });
  assert.equal(await ocr(file), MEASURED);
  assert.equal(ocr.degraded(file), true);
  const legacy = dualReadOcr(async () => MEASURED, async () => MEASURED, async (_f, f) => f);
  assert.equal(await legacy(file), MEASURED);
});

test("parseStrongLines: kódblokkos JSON is olvasható; hibás válasz hibát dob (→ ⟦?⟧ fail-safe)", () => {
  assert.deepEqual([...parseStrongLines("```json\n{\"lines\":[{\"n\":2,\"text\":\"Ázsia, Közel-Kelet térsége\"},{\"n\":3,\"text\":\"\"}]}\n```")], [[2, "Ázsia, Közel-Kelet térsége"]]);
  assert.throws(() => parseStrongLines("nem tudom"));
});

test("szerző- és bank-skill: OCR-zajból tényt kikövetkeztetni tilos", () => {
  assert.match(ROLE_SKILLS.author, /értelmetlen, nem létező szavaiból \(OCR-zaj\) tényt kikövetkeztetni tilos/);
  assert.match(ROLE_SKILLS.bank, /OCR-zajból kikövetkeztetett tény/);
});

test("integráció, valódi magyar szótár: Kesia/Lepesztető jelölt, Ázsia/zikkurat nem", async () => {
  const lexicon = await loadHungarianLexicon();
  assert.ok(lexicon, "a hunspell-asm + dictionary-hu betölthető");
  const flagged = nonWordLines("Mezopotámia, Ázsia, Közel-Kelet térsége\nKesia, Föld - Felt. térsége\nLepesztető toronytemplom, zikkurat\nöntözéses földművelés, kézművesek", lexicon).flatMap((l) => l.words);
  for (const w of ["Kesia", "Felt", "Lepesztető"]) assert.ok(flagged.includes(w), `${w} jelölt: ${flagged.join(",")}`);
  for (const w of ["Ázsia", "Közel-Kelet", "zikkurat", "toronytemplom", "öntözéses", "kézművesek"]) assert.ok(!flagged.includes(w), `${w} nem jelölt`);
  assert.equal(await loadHungarianLexicon(), lexicon, "egyszer betöltött (singleton)");
});

/* Review #194 — szótár-őr pontosítások. */

test("review #194: az ismétlődő kérdéses szó MINDEN előfordulása jelölt („Kesia Kesia”)", () => {
  const text = "Kesia Kesia, Föld - Felt. térsége";
  const out = decideNonWordLines(text, nonWordLines(text, isWord), new Map(), isWord);
  assert.equal(out.text, `Kesia${UNCERTAIN_MARK} Kesia${UNCERTAIN_MARK}, Föld - Felt${UNCERTAIN_MARK}. térsége`);
});

test("review #194: hosszú (≥ 8 szó), > 40 %-ban nem-szó erős sor NEM lép a helyére (nincs idegen-szöveg kihagyás) → ⟦?⟧", () => {
  const text = "Kesia, Föld - Felt. térsége";
  const strong = "Föld térsége Qwerty Asdfgh Zxcvbn Poiuyt Lkjhgf Mnbvcx";
  const out = decideNonWordLines(text, nonWordLines(text, isWord), new Map([[1, strong]]), isWord);
  assert.equal(out.replaced.length, 0);
  assert.match(out.text, new RegExp(`Kesia${mark}`));
  assert.doesNotMatch(out.text, /Qwerty/);
});

test("review #194: a célzott erős olvasás hibája → ⟦?⟧ ÉS degraded, a jelölt átirat nem kerül cache-be", async () => {
  const ocr = dualReadOcr(async () => MEASURED, async () => MEASURED, async () => { throw new Error("nem hívható"); }, undefined, {
    lexicon: async () => isWord,
    strongLines: async () => { throw new Error("429"); },
  });
  const puts: string[] = [];
  const cached = withOcrCache(ocr, "m", { get: async () => null, put: async (_k, t) => { puts.push(t); } }, (f) => !ocr.degraded(f));
  assert.match(await cached(file), new RegExp(`Kesia${mark}`));
  assert.equal(ocr.degraded(file), true);
  assert.deepEqual(puts, [], "átmeneti hiba nem mérgezi a cache-t");
  const noStrong = dualReadOcr(async () => MEASURED, async () => MEASURED, async () => { throw new Error("nem hívható"); }, undefined, { lexicon: async () => isWord });
  assert.match(await noStrong(file), new RegExp(`Kesia${mark}`));
  assert.equal(noStrong.degraded(file), false, "a hiányzó erős olvasó konfiguráció (a cache-kulcsban), nem átmeneti hiba");
});

test("review #194: egyolvasós út (nincs második olvasó) — a végső átirat is szótár-őrön megy át", async () => {
  let strongCalls = 0;
  const single = lexiconGuardedOcr(async () => MEASURED, {
    lexicon: async () => isWord,
    strongLines: async () => { strongCalls++; return new Map([[2, "Ázsia, Közel-Kelet térsége"]]); },
  });
  const out = await single(file);
  assert.equal(strongCalls, 1);
  assert.match(out, /Ázsia, Közel-Kelet térsége/);
  assert.match(out, new RegExp(`Lepesztető${mark}`));
  assert.equal(single.degraded(file), false);
  const failing = lexiconGuardedOcr(async () => MEASURED, { lexicon: async () => isWord, strongLines: async () => { throw new Error("időtúllépés"); } });
  assert.match(await failing(file), new RegExp(`Kesia${mark}`));
  assert.equal(failing.degraded(file), true);
  const noLexicon = lexiconGuardedOcr(async () => MEASURED, { lexicon: async () => null });
  assert.equal(await noLexicon(file), MEASURED);
  assert.equal(noLexicon.degraded(file), true);
});
