import assert from "node:assert/strict";
import test from "node:test";

import { GRADE_QUIZ_ITEMS, GRADE_SUBJECTS, type GradeQuizItem } from "../client/src/data/gradeQuizBank";
import { normalizePrompt } from "../client/src/game-engine/gradeQuiz";

/**
 * JB (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „### JB”, terv D18, JB-A1): az évfolyam-bank bővítése.
 * A párbaj-visszavágóknál és a sűrűbb kérdésütemezésnél évfolyamonként 90 tétel gyorsan ismétlődne, ezért a bővített
 * évfolyamokon ≥ 270 tétel, tárgy × sáv cellánként ≥ 18.
 *
 * A meglévő `grade-quiz-bank.test.ts` (szerkezet, egysoros forrás, magyarázat-kulcsszó, számolós ellenőrzés) változatlanul
 * fut; ez a fájl a bővítés invariánsait méri, és egy TŐLE FÜGGETLEN második számolót is futtat a bővítés matek-tételein.
 *
 * A JBa a 3–6., a JBb a 7–9. évfolyamot bővítette; a JBc (10–12.) ehhez a listához adja hozzá a saját évfolyamait.
 */
const EXPANDED_GRADES = [3, 4, 5, 6, 7, 8, 9] as const;
const ALL_GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/**
 * Karakterkorlát (durva előszűrő a gyártáshoz): kérdés ≤ 90 (a `windowMsFor` 120 karakteres telítési pontja alatt),
 * opció ≤ 40, a 7–9. évfolyamon kérdés + 4 opció ≤ 170. A TÉNYLEGES olvashatóságot nem ez, hanem a játék szűrője
 * (`fitsAllViewports`, lent) méri — review #453.
 */
const TOTAL_LIMIT_GRADES = [7, 8, 9] as const;
const MAX_PROMPT = 90;
const MAX_OPTION = 40;
const MAX_TOTAL = 170;
const MIN_PER_GRADE = 270;
const MIN_PER_CELL = 18;

const pad = (n: number) => String(n).padStart(2, "0");
const where = (q: GradeQuizItem) => `${q.id} „${q.prompt}"`;
/** A bővítés tételei: az eredeti 001–018 utáni azonosítók. */
const isExpansion = (q: GradeQuizItem) => Number(q.id.slice(-3)) >= 19;
const optionKey = (o: string) => o.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
const inGrade = (g: number) => GRADE_QUIZ_ITEMS.filter((q) => q.grade === g);

/* ------------------------------ darabszám ------------------------------ */

test("JB-A1: a bővített évfolyamokon ≥ 270 tétel, tárgy × sáv cellánként ≥ 18", () => {
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    const items = inGrade(g);
    if (items.length < MIN_PER_GRADE) bad.push(`${g}. évf.: ${items.length} tétel`);
    for (const s of GRADE_SUBJECTS) {
      for (const t of [1, 2, 3] as const) {
        const n = items.filter((q) => q.subject === s && q.tier === t).length;
        if (n < MIN_PER_CELL) bad.push(`${g}. évf. ${s} tier ${t}: ${n} tétel`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a bővítés azonosítói évfolyamonként és tárgyanként folytonosak (019-től, rés nélkül)", () => {
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    for (const s of GRADE_SUBJECTS) {
      const nums = inGrade(g).filter((q) => q.subject === s).map((q) => Number(q.id.slice(-3))).sort((a, b) => a - b);
      nums.forEach((n, i) => { if (n !== i + 1) bad.push(`g${pad(g)}-${s}: a ${i + 1}. helyen ${n}`); });
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/* ------------------------------ egyediség ------------------------------ */

test("évfolyamon belül nincs két azonos kérdés (a választó normalizálásával: kis-/nagybetű, szóköz, Unicode-alak)", () => {
  const bad: string[] = [];
  for (let g = 3; g <= 12; g++) {
    const seen = new Map<string, string>();
    for (const q of inGrade(g)) {
      const key = normalizePrompt(q.prompt);
      const prev = seen.get(key);
      if (prev) bad.push(`${q.id} = ${prev}: „${q.prompt}"`);
      seen.set(key, q.id);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("pontosan 4 opció, normalizálva (Unicode, kis-/nagybetű, záró írásjel) is különbözők; egy kulcs", () => {
  const bad: string[] = [];
  for (const q of GRADE_QUIZ_ITEMS) {
    const keys = q.options.map(optionKey);
    if (q.options.length !== 4) bad.push(`${where(q)}: ${q.options.length} opció`);
    if (new Set(keys).size !== keys.length) bad.push(`${where(q)}: egybeeső opciók → ${q.options.join(" | ")}`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) bad.push(`${where(q)}: correctIndex ${q.correctIndex}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/* ------------------------------ tartalmi (nem szöveges) duplikátum — félautomata ------------------------------ */

/**
 * Review #453 (Copilot): a szöveges egyediség-ellenőrzés nem fogja meg, ha két tétel MÁS megfogalmazással ugyanazt kérdezi
 * (pl. „Melyik versben hangzik el: „Talpra magyar…”?” és „Melyik Petőfi-vers kezdődik így: „Talpra magyar…”?”); a választó
 * ismétlésszűrője (`normalizePrompt`) mindkettőt újnak látja. Jelölt pár: azonos évfolyam és tárgy, azonos helyes válasz, és
 * a kérdésekben ugyanaz az idézet vagy a tartalmas szavak Jaccard-átfedése ≥ 0,4. Minden jelöltet ember néz át: vagy a
 * tételt cseréljük, vagy indoklással a `REVIEWED_NOT_DUPLICATE` listára kerül.
 */
const DUP_STOP = new Set(["melyik", "mennyi", "számold", "oldd", "illik", "mondatba", "szó", "szót", "írta", "helyes", "című", "mit", "jelent", "angolul", "magyarul", "hogyan", "milyen", "hány", "van", "nevezzük", "the", "what", "which", "alak", "kérdés", "egy", "egyik", "között", "szerint", "verset", "versben", "regényt"]);
const REVIEWED_NOT_DUPLICATE: Record<string, string> = {
  "g06-math-004|g06-math-024": "azonos számolási sablon (százalékérték), eltérő számokkal",
  "g07-math-009|g07-math-033": "két különböző egyenlet, véletlenül azonos megoldással",
  "g09-math-003|g09-math-021": "két különböző egyenlet, véletlenül azonos megoldással",
  "g09-math-009|g09-math-015": "két különböző egyenlet, véletlenül azonos megoldással",
};

test("tartalmi duplikátum-jelöltek (azonos válasz + azonos idézet / nagy szóátfedés) mind átnézve, 3–9. évfolyam", () => {
  const words = (s: string) => new Set(s.toLocaleLowerCase("hu").split(/[^\p{L}]+/u).filter((w) => w.length >= 3 && !DUP_STOP.has(w)));
  const quotes = (s: string) => [...s.matchAll(/„([^”]+)”/g)].map((m) => optionKey(m[1]!));
  const found: string[] = [];
  for (const g of EXPANDED_GRADES) {
    const items = inGrade(g);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (a.subject !== b.subject || optionKey(a.options[a.correctIndex]!) !== optionKey(b.options[b.correctIndex]!)) continue;
        const wa = words(a.prompt);
        const wb = words(b.prompt);
        const inter = [...wa].filter((w) => wb.has(w)).length;
        const jaccard = inter / Math.max(1, new Set([...wa, ...wb]).size);
        const sameQuote = quotes(a.prompt).some((x) => quotes(b.prompt).includes(x));
        if (jaccard >= 0.4 || sameQuote) found.push(`${a.id}|${b.id}`);
      }
    }
  }
  const unreviewed = found.filter((k) => !(k in REVIEWED_NOT_DUPLICATE));
  assert.deepEqual(unreviewed, [], `át nem nézett tartalmi duplikátum-jelölt:\n${unreviewed.join("\n")}`);
  const stale = Object.keys(REVIEWED_NOT_DUPLICATE).filter((k) => !found.includes(k));
  assert.deepEqual(stale, [], `elavult bejegyzés a REVIEWED_NOT_DUPLICATE listán:\n${stale.join("\n")}`);
  // önellenőrzés: a review-ban talált pár a jelölt-szabályt kiváltaná
  const a = words("Melyik versben hangzik el: „Talpra magyar, hí a haza!”?");
  const b = words("Melyik Petőfi-vers kezdődik így: „Talpra magyar, hí a haza!”?");
  assert.ok(quotes("x „Talpra magyar, hí a haza!” y").length === 1 && [...a].some((w) => b.has(w)));
});

/* ------------------------------ tartalmi formai szabályok (bővített évfolyamok) ------------------------------ */

const BANNED_OPTION = /^(mindegyik|egyik sem|egyik se|mindkettő|mind a (három|négy)|all of them|none of them|both)\b/i;

test("bővített évfolyamok: nincs „mindegyik / egyik sem / mindkettő” opció, nincs tiltott karakter", () => {
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    for (const q of inGrade(g)) {
      if (q.options.some((o) => BANNED_OPTION.test(o.trim()))) bad.push(`${where(q)}: tiltott opció`);
      const text = [q.prompt, ...q.options, q.explanation].join(" ");
      // ASCII idézőjel helyett „…”; nem törő / keskeny szóköz, tab, sortörés, visszaper nem kerülhet a szövegbe (C-31, C-35)
      if (/["\\\u00A0\u202F\t\r\n]/.test(text)) bad.push(`${where(q)}: tiltott karakter`);
      if (/[ôõûũ]/.test(text)) bad.push(`${where(q)}: rossz ékezet (ő / ű helyett)`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a bővítés tételei telefonon gyorsan olvashatók: kérdés ≤ 90, opció ≤ 40 karakter (7–9.: együtt ≤ 170); magyarázat 40–260", () => {
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    for (const q of inGrade(g).filter(isExpansion)) {
      if (q.prompt.length > MAX_PROMPT) bad.push(`${where(q)}: kérdés ${q.prompt.length} karakter`);
      for (const o of q.options) if (o.length > MAX_OPTION) bad.push(`${where(q)}: opció ${o.length} karakter: ${o}`);
      const total = q.prompt.length + q.options.reduce((s, o) => s + o.length, 0);
      if ((TOTAL_LIMIT_GRADES as readonly number[]).includes(g) && total > MAX_TOTAL) bad.push(`${where(q)}: kérdés + opciók ${total} karakter`);
      const why = q.explanation.trim().length;
      if (why < 40 || why > 260) bad.push(`${q.id}: magyarázat ${why} karakter`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/**
 * Review #453 (Copilot): a hosszkorlátot nem a 9 mp-es felső határhoz, hanem a JÁTÉK SAJÁT szűrőjéhez mérjük — ugyanaz a
 * `fitsAllViewports` (J0c-b, `game-engine/play/promptFit.ts` + `reading.ts`), amelyet a kérdés-forrás `accept`-ként használ:
 * a gyerek évfolyamához mért olvasási idő (`readingMsFor`) ≤ 9 mp, és a kérdés / opciók mindhárom telefonos nézetben elférnek.
 * Az alap-ablak a legszigorúbb valós hívóé (a `promptFit` alapértéke, 4000 ms; a párbaj 6000, a próbaoldal 4500).
 * Küszöb: a bővített évfolyamokon a tételek ≥ 95%-a játszható, a bővítés (019+) tételei mind, és minden tárgy × sáv cellában
 * legalább 15 játszható tétel marad.
 */
const STRICTEST_BASE_WINDOW_MS = 4000;

test("olvashatóság a játék szűrőjével (fitsAllViewports): ≥ 95% / évfolyam, a bővítés mind, cellánként ≥ 15", async () => {
  const { fitsAllViewports } = await import("../client/src/game-engine/play/promptFit");
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    const rows = inGrade(g).map((q) => ({ q, fit: fitsAllViewports(q, { grade: g, baseWindowMs: STRICTEST_BASE_WINDOW_MS }) }));
    const ok = rows.filter((r) => r.fit.ok).length;
    if (ok / rows.length < 0.95) bad.push(`${g}. évf.: csak ${ok}/${rows.length} játszható`);
    for (const r of rows) {
      if (isExpansion(r.q) && !r.fit.ok) {
        bad.push(`${where(r.q)}: olvasás ${r.fit.readingMs} ms (≤ 9000?), elfér: ${r.fit.fits}, opciók: ${r.fit.optionsFit}`);
      }
    }
    for (const s of GRADE_SUBJECTS) {
      for (const t of [1, 2, 3] as const) {
        const n = rows.filter((r) => r.q.subject === s && r.q.tier === t && r.fit.ok).length;
        if (n < 15) bad.push(`${g}. évf. ${s} tier ${t}: ${n} játszható tétel (< 15)`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a helyes válasz helye kiegyensúlyozott: évfolyamonként mind a 4 pozíció 18–32%", () => {
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    const items = inGrade(g);
    const pos = [0, 0, 0, 0];
    for (const q of items) pos[q.correctIndex]!++;
    pos.forEach((n, i) => {
      const share = n / items.length;
      if (share < 0.18 || share > 0.32) bad.push(`${g}. évf. ${i}. pozíció: ${(share * 100).toFixed(1)}%`);
    });
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("„tudás nélkül kitalálható” jel: a helyes opció tárgyanként legfeljebb 35%-ban egyedül a leghosszabb", () => {
  // Véletlen elrendezésnél ~25% várható; a gyerek a „leghosszabb = helyes” szabállyal ne nyerhessen.
  const bad: string[] = [];
  for (const g of EXPANDED_GRADES) {
    for (const s of GRADE_SUBJECTS) {
      const items = inGrade(g).filter((q) => q.subject === s);
      const longest = items.filter((q) => {
        const len = q.options[q.correctIndex]!.length;
        return q.options.every((o, i) => i === q.correctIndex || o.length < len);
      }).length;
      if (longest / items.length > 0.35) bad.push(`${g}. évf. ${s}: ${longest}/${items.length}`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/* ------------------------------ helyesírási tételek: a „hibás” opció ne legyen létező szó ------------------------------ */

/**
 * Review #448 (g03-hungarian-033, g04-hungarian-003): a „gólja” létező szó (a gól birtokos alakja), mégis „hibás” opció volt
 * a „gólya” mellett — a jól tudó gyereket büntette. Szövegkörnyezet nélküli („Melyik szó helyes?”) helyesírási kérdésnél
 * minden egyszavas rossz opciót a magyar hunspell-szótár (`dictionary-hu`, `hunspell-asm`) elutasít, a helyeset elfogadja.
 * A „ház + -val”, „(hall) …” típusú kérdést a kérdés maga szűkíti, ezért azt itt nem mérjük.
 */
// (A JS `\b` ASCII-alapú — az „ó” végű „szó” után nem működik —, ezért szóköz-határral írva.)
const BARE_SPELLING = /^(Melyik (összetett )?(szó|szót|alak|szócsoportban) (?![^?]*magyarázza)[^?+()]*(helyes|hibátlan|jó)[^?+()]*\?|Hogyan írjuk helyesen\?|Melyik a helyes írásmód\?)$/u;

test("helyesírási tétel: a rossz opció nem létező szó, a helyes létező (hunspell, dictionary-hu)", async () => {
  const { default: dictionary } = await import("dictionary-hu");
  const { loadModule } = await import("hunspell-asm");
  const factory = await loadModule();
  const hunspell = factory.create(factory.mountBuffer(dictionary.aff, "hu.aff"), factory.mountBuffer(dictionary.dic, "hu.dic"));
  try {
    assert.equal(hunspell.spell("gólja"), true, "önellenőrzés: a gól birtokos alakja létező szó");
    assert.equal(hunspell.spell("gója"), false, "önellenőrzés: a „gója” nem szó");
    const bad: string[] = [];
    let checked = 0;
    // JBb: a 3–12. évfolyam MINDEN (meglévő és bővítési) helyesírási tételére érvényes, az `EXPANDED_GRADES`-től függetlenül
    for (const g of ALL_GRADES) {
      for (const q of inGrade(g).filter((x) => x.subject === "hungarian" && BARE_SPELLING.test(x.prompt.trim()))) {
        checked++;
        q.options.forEach((o, i) => {
          const w = o.trim();
          if (/[\s-]/.test(w)) return; // több szóból álló / kötőjeles opció: egybe- / különírást a szótár nem dönti el
          const ok = hunspell.spell(w);
          if (i === q.correctIndex && !ok) bad.push(`${where(q)}: a helyes „${w}” a szótárban nincs`);
          if (i !== q.correctIndex && ok) bad.push(`${where(q)}: a „hibás” „${w}” létező szó → két védhető válasz`);
        });
      }
    }
    assert.ok(checked >= 10, `kevés helyesírási tétel ismerhető fel (${checked}) — a minta elcsúszott?`);
    assert.deepEqual(bad, [], bad.join("\n"));
  } finally {
    hunspell.dispose();
  }
});

/* ------------------------------ független számoló a bővítés matek-tételein ------------------------------ */

/**
 * Szándékosan MÁS megvalósítás, mint a `grade-quiz-bank.test.ts` számolója: a `3/4` alakú törtet egyetlen számként
 * (racionális literálként) olvassa, ahogy a gyerek is, a `:` és a `·` balról jobbra, a `²` hatvány. Ha a két számoló
 * egy tételen eltérően értené a kifejezést, valamelyik teszt jelez — a kétértelmű leírást a tételben kell javítani.
 */
const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

function evalExpr(src: string, x?: number): number | null {
  const s = src
    .replace(/[−–]/g, "-")
    .replace(/(\d) (?=\d{3}(?!\d))/g, "$1")
    .replace(/(\d),(\d)/g, "$1.$2")
    // JBb: felső indexes kitevő („2⁵”, „10⁻³”) → `^` + szám
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^${[...m].map((c) => SUPERSCRIPT[c]).join("")} `)
    .trim();
  const toks = s.match(/\d+(?:\.\d+)?\/\d+|\^-?\d+|\d+(?:\.\d+)?|[-+·:()x√]|\S/g);
  if (!toks) return null;
  let p = 0;
  const num = (t: string) => (t.includes("/") ? Number(t.split("/")[0]) / Number(t.split("/")[1]) : Number(t));
  function atom(): number {
    const t = toks![p++];
    if (t === undefined) throw new Error("vége");
    let v: number;
    if (t === "(") { v = sum(); if (toks![p++] !== ")") throw new Error(")"); }
    else if (t === "-") return -atom();
    else if (t === "√") v = Math.sqrt(atom()); // „√144”, „√(6² + 8²)”
    else if (/^\d/.test(t)) v = num(t);
    else if (t === "x" && x !== undefined) v = x;
    else throw new Error(`váratlan ${t}`);
    while (toks![p]?.startsWith("^")) v = v ** Number(toks![p++]!.slice(1));
    return v;
  }
  function prod(): number {
    let v = atom();
    for (;;) {
      if (toks![p] === "·" || toks![p] === ":") v = toks![p++] === "·" ? v * atom() : v / atom();
      else if (toks![p] === "x" || toks![p] === "(" || toks![p] === "√") v *= atom(); // „3x”, „2(x + 1)”, „2√3”
      else return v;
    }
  }
  function sum(): number {
    let v = prod();
    while (toks![p] === "+" || toks![p] === "-") v = toks![p++] === "+" ? v + prod() : v - prod();
    return v;
  }
  try {
    const v = sum();
    return p === toks.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Opció számértéke: tiszta szám / tört / tizedes, legfeljebb mértékegységgel („36 cm”, „24 cm³”). */
function optionNumber(o: string): number | null {
  // JBb: a számrészben hatvány, gyök és normálalak is lehet („2⁵”, „√2”, „3 · 10⁴”). A számrész MOHÓ (review #453): lusta
  // illesztésnél a záró „²” / „³” a mértékegységhez került, és a „2³” 2-nek, a „3 · 10³” 30-nak számított. A mértékegység
  // betűvel vagy °-kal kezdődik, így a felső index csak betű után (cm², m³) lehet egység.
  const m = /^(-?[\d ,./−⁰¹²³⁴⁵⁶⁷⁸⁹⁻·√()]+)(?:\s*[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ°][a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ²³]*\.?)?$/u.exec(o.trim());
  return m ? evalExpr(m[1]!) : null;
}

/** A tétel opcióinak igazsága, ha a kérdés gépileg kiértékelhető; különben `null`. */
function truths(q: GradeQuizItem): boolean[] | null {
  const prompt = q.prompt.trim();
  const div = /^Melyik szám osztható (\d+)-[a-zé]+(?: és (\d+)-[a-zé]+ is|, de (\d+)-[a-zé]+ nem)?\?$/u.exec(prompt);
  if (div) {
    const values = q.options.map((o) => (/^\d[\d ]*$/.test(o.trim()) ? Number(o.replace(/ /g, "")) : NaN));
    if (values.some(Number.isNaN)) return null;
    const a = Number(div[1]);
    return values.map((v) => v % a === 0 && (div[2] ? v % Number(div[2]) === 0 : true) && (div[3] ? v % Number(div[3]) !== 0 : true));
  }
  const eq = /^Oldd meg:\s*([^=]+)=([^=]+?)\s*$/.exec(prompt);
  if (eq) {
    const xs = q.options.map((o) => { const m = /^x = (.+)$/.exec(o.trim()); return m ? evalExpr(m[1]!) : null; });
    if (xs.some((v) => v === null)) return null;
    const sides = xs.map((v) => [evalExpr(eq[1]!, v!), evalExpr(eq[2]!, v!)]);
    if (sides.some(([l, r]) => l === null || r === null)) return null;
    return sides.map(([l, r]) => Math.abs(l! - r!) <= 1e-9 * Math.max(1, Math.abs(r!)));
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const pct = /^Mennyi (\d+)-[a-zé]+ (?:a|az) (\d+)%-a\?$/u.exec(prompt);
  // JBb: két vagy több szám („a 12, a 18 és a 30”) — mind beleszámít, nem csak az utolsó pár
  const multi = /^Mennyi ((?:(?:a |az )?\d+, )*(?:a |az )?\d+ és (?:a |az )?\d+) (legnagyobb közös osztója|legkisebb közös többszöröse)\?$/.exec(prompt);
  const calc = /^Számold ki:\s*(.+?)\s*$/.exec(prompt) ?? /^Mennyi\s+(.+?)\s*\?$/.exec(prompt);
  let truth: number | null = null;
  if (pct) truth = (Number(pct[1]) * Number(pct[2])) / 100;
  else if (multi) {
    const nums = [...multi[1]!.matchAll(/\d+/g)].map((m) => Number(m[0]));
    truth = multi[2]!.startsWith("legnagyobb")
      ? nums.reduce((a, b) => gcd(a, b))
      : nums.reduce((a, b) => (a * b) / gcd(a, b));
  } else if (calc) truth = evalExpr(calc[1]!);
  if (truth === null) return null;
  const values = q.options.map(optionNumber);
  if (values.some((v) => v === null)) return null;
  return values.map((v) => Math.abs(v! - truth) <= 1e-9 * Math.max(1, Math.abs(truth)));
}

test("független számoló: a bővítés kiértékelhető matek-tételeinél pontosan egy opció igaz, és az a kulcs (≥ 40% lefedve)", () => {
  const bad: string[] = [];
  const coverage: string[] = [];
  for (const g of EXPANDED_GRADES) {
    const math = inGrade(g).filter((q) => q.subject === "math" && isExpansion(q));
    let checked = 0;
    for (const q of math) {
      const t = truths(q);
      if (!t) continue;
      checked++;
      const idx = t.flatMap((x, i) => (x ? [i] : []));
      if (idx.length !== 1 || idx[0] !== q.correctIndex) {
        bad.push(`${where(q)} → igaz: [${idx.map((i) => q.options[i]).join(" | ")}], kulcs: ${q.options[q.correctIndex]}`);
      }
    }
    if (math.length === 0 || checked / math.length < 0.4) coverage.push(`${g}. évf.: ${checked}/${math.length}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
  assert.deepEqual(coverage, [], `kevés kiértékelhető tétel:\n${coverage.join("\n")}`);
});

test("a független számoló önellenőrzése", () => {
  assert.equal(evalExpr("6 · 8 + 4 · 7"), 76);
  assert.equal(evalExpr("36 : (2 + 4) · 5"), 30);
  assert.equal(evalExpr("(3/4) : (1/2)"), 1.5);
  assert.equal(evalExpr("3/4 : 1/2"), 1.5);
  assert.equal(evalExpr("4 000 + 5 000 − 2 000"), 7000);
  assert.equal(evalExpr("−8 + 3 − (−6)"), 1);
  assert.equal(evalExpr("12,5 − 4,75"), 7.75);
  assert.equal(evalExpr("5²"), 25);
  assert.equal(evalExpr("3 kutya"), null);
  assert.equal(optionNumber("24 cm³"), 24);
  assert.equal(optionNumber("21/10"), 2.1);
  assert.equal(optionNumber("4 356"), 4356);
  assert.equal(optionNumber("x = 4"), null);
  const item = (prompt: string, options: string[]): GradeQuizItem =>
    ({ id: "g05-math-999", grade: 5, subject: "math", tier: 1, prompt, options, correctIndex: 0, explanation: "" });
  assert.deepEqual(truths(item("Melyik szám osztható 2-vel, de 10-zel nem?", ["4 356", "4 350", "4 355", "4 357"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Melyik szám osztható 4-gyel és 5-tel is?", ["40", "45", "24", "50"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Mennyi 7 · 9?", ["63", "56", "72", "81"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Mennyi 80-nak a 25%-a?", ["20", "25", "32", "55"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Mennyi 12 és 18 legnagyobb közös osztója?", ["6", "3", "36", "2"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Mennyi 4 és 6 legkisebb közös többszöröse?", ["12", "24", "2", "10"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Oldd meg: 3x + 4 = 19", ["x = 5", "x = 6", "x = 15", "x = 7"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Oldd meg: 2(x − 1) = 8", ["x = 5", "x = 4", "x = 3", "x = 9"])), [true, false, false, false]);
  assert.equal(truths(item("Mennyi 347 tízesre kerekítve?", ["350", "340", "300", "400"])), null);
  // JBb: hatvány, gyök, normálalak, több szám LKKT-ja
  assert.equal(evalExpr("2⁵ · 2³ : 2⁶"), 4);
  assert.equal(evalExpr("√(6² + 8²)"), 10);
  assert.equal(evalExpr("√144"), 12);
  assert.ok(Math.abs(evalExpr("10⁻²")! - 0.01) < 1e-12);
  assert.equal(evalExpr("−3²"), -9);
  assert.equal(evalExpr("(−3)²"), 9);
  assert.equal(optionNumber("3 · 10⁴"), 30000);
  assert.equal(optionNumber("16 cm²"), 16);
  // review #453: a záró felső index a SZÁM része, nem mértékegység
  assert.equal(optionNumber("2³"), 8);
  assert.equal(optionNumber("5²"), 25);
  assert.equal(optionNumber("3 · 10³"), 3000);
  assert.equal(optionNumber("2³ cm³"), 8);
  assert.equal(optionNumber("10⁻² m"), 0.01);
  assert.equal(optionNumber("−3 °C"), -3);
  assert.deepEqual(truths(item("Számold ki: 2 · 2 · 2", ["8", "2³", "6", "4"])), [true, true, false, false], "a 8 és a 2³ is igaz → a kapu jelez");
  assert.deepEqual(truths(item("Mennyi a 12, a 18 és a 30 legkisebb közös többszöröse?", ["180", "90", "360", "60"])), [true, false, false, false]);
  assert.deepEqual(truths(item("Mennyi 24, 36 és 60 legnagyobb közös osztója?", ["12", "6", "4", "24"])), [true, false, false, false]);
});
