import { studioConnection, withQuotaFailover } from "../ai/studio-provider";
/**
 * #163 — OCR layer for image sources (owner decision, 2026-09-05).
 *
 * Why: images carry no searchable text, so the D1 verbatim check could never
 * verify a quote from a photo source — every concept stayed "Nem igazolt" and
 * the map could not be approved. A CHEAP vision model transcribes each image
 * ONCE at extraction time; the transcript joins the stored sourceText that
 * both the initial check and the admin's "Forrás-ellenőrzés újra" run against.
 *
 * Cost control (owner requirement): the transcription runs on the cheap `ocr`
 * model (resolveStudioModel("ocr"), see models.ts), never on the
 * expensive extract model — and the client downscales photos before upload
 * (shared/studio-ui.ts downscaleTargetOf), so fewer pixels reach the model.
 *
 * Fail-open by design: a failed OCR yields empty text for that image and the
 * extraction continues — the teacher can still fix quotes by hand; a model
 * outage must not lose a 40-concept run.
 */

import { createHash } from "node:crypto";

import { logger } from "../lib/logger";
import type { ExtractorFile } from "./extractor";
import { lexiconWordsOf, nonWordLines, passesLexicon, type IsWord, type NonWordLine } from "./ocr-lexicon";
import { withRoleSkill } from "./role-skills";
import Anthropic from "@anthropic-ai/sdk";
import { providerForModel, type OcrEffort } from "../ai/models";

export type OcrResult = { name: string; text: string };

export type OcrFn = (file: ExtractorFile) => Promise<string>;

/**
 * #170 — hány kép megy egyszerre az olcsó vision-modellre. Mérve: egy kép
 * 40-90 s; 10 kép szekvenciálisan 7-15 perc volt (a Render eközben újraindult
 * és minden veszett). 3-as poollal ugyanez ~2-4 perc, provider-barát ütemben.
 */
const OCR_CONCURRENCY = 3;

/** Egy kép OCR-hívása, bukásnál üres átirat (fail-open) — a futás sosem hal meg. */
async function ocrOne(file: ExtractorFile, ocr: OcrFn): Promise<OcrResult> {
  try {
    return { name: file.name, text: await ocr(file) };
  } catch (error) {
    logger.warn(
      `[STUDIO/OCR] A(z) ${file.name} átirata nem készült el (${error instanceof Error ? error.message : String(error)}) — üres szöveggel folytatjuk.`,
    );
    return { name: file.name, text: "" };
  }
}

/**
 * Transcribe the image files only; other kinds already carry their text.
 * #170: bounded parallel pool — output order matches input order, progress
 * reports COMPLETED count (nem "melyik indul", hanem "hány kész").
 */
export async function ocrTextsOf(
  files: ExtractorFile[],
  ocr: OcrFn,
  onProgress?: (done: number, total: number) => void,
): Promise<OcrResult[]> {
  const images = files.filter((f) => f.kind === "image");
  const out: OcrResult[] = new Array(images.length);
  let next = 0;
  let done = 0;
  onProgress?.(0, images.length);

  async function worker(): Promise<void> {
    while (next < images.length) {
      const index = next++;
      out[index] = await ocrOne(images[index], ocr);
      done++;
      onProgress?.(done, images.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, images.length) }, () => worker()));
  return out;
}

/* ------------------------------------------------------------------ *
 * #170 — tartalom-hash átirat-cache: ugyanazt a képet SOHA nem fizetjük
 * ki kétszer, és restart utáni újrafutásnál a kész átiratok ingyen vannak.
 * ------------------------------------------------------------------ */

export type OcrCacheStore = {
  get(key: string): Promise<string | null>;
  put(key: string, text: string): Promise<void>;
};

/** Determinista kulcs: a kép tartalma + a modell (más modell átirata más). */
export function ocrCacheKeyOf(imageContent: string, model: string, prompt = OCR_SYSTEM_PROMPT): string {
  return createHash("sha256").update(JSON.stringify([model, prompt, imageContent])).digest("hex");
}

/**
 * Cache-elő burkolat egy OcrFn köré. Találat: nulla modellhívás. Miss: hívás,
 * és a NEM ÜRES átirat mentése (a bukott/üres OCR nincs cache-elve, hogy a
 * következő futás újrapróbálhassa). A cache-hiba sosem dönti be a hívást.
 */
export function withOcrCache(ocr: OcrFn, model: string, store: OcrCacheStore, shouldStore: (file: ExtractorFile) => boolean = () => true): OcrFn {
  return async (file: ExtractorFile) => {
    const key = ocrCacheKeyOf(file.content, model);
    try {
      const hit = await store.get(key);
      if (hit !== null && hit.trim() !== "") {
        logger.info(`[STUDIO/OCR] Átirat cache-ből: ${file.name}`);
        return hit;
      }
    } catch {
      /* cache-olvasási hiba: megyünk a modellre */
    }
    const text = await ocr(file);
    if (text.trim() !== "" && shouldStore(file)) {
      try {
        await store.put(key, text);
      } catch {
        /* cache-írási hiba: az átirat attól még megvan */
      }
    }
    return text;
  };
}

/* ------------------------------------------------------------------ *
 * Spec 2026-09-23 — KETTŐS OLVASÁS kézírásra/fotóra.
 *
 * Mérve élesben (map 2c43327f, kézírásos füzet): egyetlen olvasat „bódex”, „bézzel”,
 * „föld-változása” hibákat adott, és ezek a térképen át a leckébe kerültek. Két független
 * modellcsalád ritkán téved ugyanott ugyanúgy: az eltérés a gyanús hely. Csak eltérésnél
 * fut döntő hívás (a képpel együtt), és a döntés determinisztikus őrön megy át: kizárólag
 * az eltérő helyeken változtathat, és ott is csak a két olvasat egyikét (vagy tőlük ≤ 2
 * betűben eltérő alakot) írhatja. Ha az őr bukik vagy bármely hívás hibázik: az első olvasat.
 * ------------------------------------------------------------------ */

export type OcrDisagreement = { first: string; second: string };
/** Review #192: a vita helye — az első olvasat tokenjei közt a vitatott szakasz kezdő indexe (azonos szó máshol ne vigye el a jelet). */
export type LocatedOcrDisagreement = OcrDisagreement & { at: number };

const ocrTokens = (text: string) => text.split(/\s+/).filter(Boolean);
const tokenKey = (t: string) => t.toLowerCase().normalize("NFC").replace(/[.,;:!?()„”"'«»]/g, "");

/** Word-level LCS diff; returns the differing spans (first-read side, second-read side). */
export function ocrDisagreements(first: string, second: string): OcrDisagreement[] {
  return locateOcrDisagreements(first, second).map(({ first: f, second: s }) => ({ first: f, second: s }));
}

/** A differing span as token index ranges in both reads (`[aStart, aEnd)` in the first, `[bStart, bEnd)` in the second). */
type TokenSpan = { aStart: number; aEnd: number; bStart: number; bEnd: number };

/** Word-level LCS diff on token keys; null when too large to align. */
function diffTokenSpans(a: string[], b: string[]): TokenSpan[] | null {
  if (a.length * b.length > 4_000_000) return null;
  const dp: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = tokenKey(a[i]) === tokenKey(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: TokenSpan[] = [];
  let i = 0, j = 0, startA = 0, startB = 0;
  const flush = () => {
    if (i > startA || j > startB) out.push({ aStart: startA, aEnd: i, bStart: startB, bEnd: j });
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && tokenKey(a[i]) === tokenKey(b[j])) { flush(); i++; j++; startA = i; startB = j; }
    else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) i++;
    else j++;
  }
  flush();
  return out;
}

/** Same diff, with each span's start token index in the first read (`at`). */
export function locateOcrDisagreements(first: string, second: string): LocatedOcrDisagreement[] {
  const a = ocrTokens(first);
  const b = ocrTokens(second);
  const spans = diffTokenSpans(a, b);
  if (!spans) return a.join(" ") === b.join(" ") ? [] : [{ first, second, at: 0 }];
  return spans.map((s) => ({ first: a.slice(s.aStart, s.aEnd).join(" "), second: b.slice(s.bStart, s.bEnd).join(" "), at: s.aStart }));
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let x = 1; x <= a.length; x++) {
    let diag = prev[0];
    prev[0] = x;
    for (let y = 1; y <= b.length; y++) {
      const up = prev[y];
      prev[y] = Math.min(prev[y] + 1, prev[y - 1] + 1, diag + (a[x - 1] === b[y - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/**
 * The guard: compared with the FIRST read, the adjudicated text may change only spans that
 * were in dispute, and each changed span must be one of the two readings or ≤2 edits from one.
 */
export function adjudicationStaysInDispute(first: string, adjudicated: string, disputes: OcrDisagreement[]): boolean {
  const allowed = disputes.flatMap((d) => [d.first, d.second]).map((s) => ocrTokens(s).map(tokenKey).join(" "));
  return ocrDisagreements(first, adjudicated).every((change) => {
    const got = ocrTokens(change.second).map(tokenKey).join(" ");
    const was = ocrTokens(change.first).map(tokenKey).join(" ");
    const disputed = allowed.some((s) => s === was || (was !== "" && s.includes(was)));
    return disputed && allowed.some((s) => s === got || (got !== "" && s !== "" && editDistance(s, got) <= 2));
  });
}

export const UNCERTAIN_MARK = "⟦?⟧";
const keyedOf = (s: string) => ocrTokens(s).map(tokenKey).filter(Boolean).join(" ");
/**
 * Spec S11/6 + S9/7 (mért: map d70d8f67, „↙⟦?⟧ elsődleges” — a nyíl-vita is jelet kapott, 13 fogalom kimaradt): a szó-kulcs csak a
 * betűket és számjegyeket tartja meg — a csak-írásjel/nyíl/szóköz eltérés NEM vita.
 */
const wordsOf = (s: string) => ocrTokens(s).map((t) => tokenKey(t).replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
const wordKeyedOf = (s: string) => wordsOf(s).join(" ");
/** Érdemi vita: a két olvasat SZAVAI > 2 szerkesztésre térnek el — az egyoldalú (beszúrás/törlés) vita is, ha a nem üres oldal > 2 betű. */
const isSubstantive = (d: OcrDisagreement) => editDistance(wordKeyedOf(d.first), wordKeyedOf(d.second)) > 2;
const MARK_AHEAD = /^[ \t]*⟦\?⟧/;
const insertMarks = (text: string, ends: Iterable<number>) => {
  let out = text;
  for (const end of [...new Set(ends)].sort((x, y) => y - x)) if (!MARK_AHEAD.test(out.slice(end))) out = `${out.slice(0, end)}${UNCERTAIN_MARK}${out.slice(end)}`;
  return out;
};
/** Tokens with their end offset (a trailing ⟦?⟧ excluded); indices match `ocrTokens`, the key ignores the mark. */
function positionedTokens(text: string): { key: string; end: number }[] {
  return [...text.matchAll(/\S+/g)].map((m) => {
    let raw = m[0];
    while (raw.endsWith(UNCERTAIN_MARK)) raw = raw.slice(0, -UNCERTAIN_MARK.length);
    return { key: tokenKey(raw.split(UNCERTAIN_MARK).join("")), end: (m.index ?? 0) + raw.length };
  });
}
/** LCS alignment: for each token of `a` the matched index in `b`, or -1; null when too large. */
function alignTokens(a: string[], b: string[]): Int32Array | null {
  if (a.length * b.length > 4_000_000) return null;
  const dp: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Int32Array(a.length).fill(-1);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { map[i] = j; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return map;
}

/** Legacy path (no first read): string search with a position-preserving cursor. */
function markByCursor(decided: string, disputes: OcrDisagreement[]): string {
  let out = decided, from = 0;
  for (const d of disputes) {
    if (!isSubstantive(d)) continue;
    const hits = [d.first, d.second].map((s) => s.trim()).filter(Boolean).map((span) => ({ span, at: out.indexOf(span, from) })).filter((h) => h.at >= 0);
    if (!hits.length) continue;
    const { span, at } = hits.reduce((x, y) => (y.at < x.at ? y : x));
    const end = at + span.length;
    out = insertMarks(out, [end]);
    from = end + UNCERTAIN_MARK.length;
  }
  return out;
}

/**
 * Spec 2026-10-05-s11 (mért: Mezopotámia-füzet, „Kesia, Föld - Felt.” ↔ a valós „Ázsia, Közel-Kelet”): a döntő olvasás után a
 * vita nyoma eddig elveszett, a téves olvasat tényként került a térképbe. Az ÉRDEMI eltérés (a két olvasat > 2 szerkesztésre
 * különbözik) szakasza a döntő átiratban „⟦?⟧” jelet kap — a rá épülő fogalom nem lesz tény (pending).
 * Review #192: a jel a vita SAJÁT helyére kerül (az első olvasathoz igazítva, nem az azonos szó első előfordulására); jelölt minden
 * érdemi vita (az egyoldalú is, ha a döntő átiratban megvan a nem üres olvasat), és a döntő átirat minden olyan változtatása, amely
 * egyik vitatott olvasattal sem egyezik (harmadik alak). `first` nélkül a régi, szövegkereséses út fut (sorrendtartó kurzorral).
 */
/** `thirdFormOnly` (spec S11/5, erős elsődleges olvasó): csak a döntő olvasat saját, egyik olvasattal sem egyező alakja kap jelet. */
export function markUnresolvedDisputes(decided: string, disputes: (OcrDisagreement & { at?: number })[], first?: string, opts: { thirdFormOnly?: boolean } = {}): string {
  if (first === undefined) return markByCursor(decided, disputes);
  const a = positionedTokens(first), c = positionedTokens(decided);
  const map = alignTokens(a.map((t) => t.key), c.map((t) => t.key));
  if (!map) return markByCursor(decided, disputes);
  const ends: number[] = [];
  const lastEnd = (from: number, to: number) => { for (let k = to - 1; k >= from; k--) if (c[k].key) return c[k].end; return -1; };
  const decidedRange = (s: number, e: number): [number, number] => {
    let prev = -1, next = c.length;
    for (let k = s - 1; k >= 0; k--) if (map[k] >= 0) { prev = map[k]; break; }
    for (let k = e; k < a.length; k++) if (map[k] >= 0) { next = map[k]; break; }
    return [prev + 1, next];
  };
  let cursor = 0;
  const spans: Array<{ s: number; e: number; r: string[] }> = [];
  for (const d of disputes) {
    const keys = ocrTokens(d.first).map(tokenKey);
    let s = d.at ?? -1;
    if (s < 0 && keys.length) {
      for (let k = cursor; k + keys.length <= a.length; k++) if (keys.every((key, n) => a[k + n].key === key)) { s = k; break; }
    }
    if (s < 0) continue;
    cursor = s + keys.length;
    spans.push({ s, e: s + keys.length, r: [d.first, d.second] });
    if (opts.thirdFormOnly || !isSubstantive(d)) continue;
    // Spec S11/6 (biztonság): a vitatott szakasz MINDEN vitatott szava jelet kap (nem csak a vége) — a két olvasatban közös szó nem.
    const [rs, re] = decidedRange(s, s + keys.length);
    const second = new Set(ocrTokens(d.second).map(tokenKey));
    const common = new Set(keys.filter((k) => second.has(k)));
    let marked = false;
    for (let k = rs; k < re; k++) if (c[k].key && !common.has(c[k].key)) { ends.push(c[k].end); marked = true; }
    if (!marked) { const end = lastEnd(rs, re); if (end >= 0) ends.push(end); }
  }
  // harmadik alak: a döntő átirat változtatása, amely egyik vitatott olvasat (szóhatáros) része sem
  const readings = disputes.flatMap((d) => [d.first, d.second]).map((r) => ` ${keyedOf(r)} `);
  let i = 0, j = 0;
  while (i <= a.length) {
    let ni = i;
    while (ni < a.length && map[ni] < 0) ni++;
    const nj = ni < a.length ? map[ni] : c.length;
    const changed = c.slice(j, nj).map((t) => t.key).filter(Boolean).join(" ");
    const was = a.slice(i, ni).map((t) => t.key).filter(Boolean).join(" ");
    // Review #195: erős elsődlegesnél az ADOTT hely vitájának olvasataihoz mérünk (más vita olvasata itt harmadik alak).
    const pool = opts.thirdFormOnly ? spans.filter((x) => x.s <= ni && x.e >= i).flatMap((x) => x.r).map((r) => ` ${keyedOf(r)} `) : readings;
    // Spec S11/6 + S9/7: csak-írásjel/nyíl változtatás nem harmadik alak; a harmadik alak MINDEN új (egyik olvasatban sem
    // szereplő) szava jelet kap (mért: „a Nílus áradási éveinek⟦?⟧” — eddig csak a szakasz végére került jel).
    if (changed && changed !== was && !pool.some((r) => r.includes(` ${changed} `)) && wordKeyedOf(changed) !== wordKeyedOf(was)) {
      const known = new Set([was, ...pool].flatMap(wordsOf));
      for (let k = j; k < nj; k++) {
        const word = c[k].key.replace(/[^\p{L}\p{N}]/gu, "");
        if (word && !known.has(word)) ends.push(c[k].end);
      }
    }
    i = ni + 1; j = nj + 1;
  }
  return insertMarks(decided, ends);
}

/**
 * Spec 2026-10-05-s11/2 (tulajdonosi döntés): a jelölt (`⟦?⟧`) vitákat egy erős, FÜGGETLEN harmadik olvasat dönti el — 2 a 3-ból:
 * ha a harmadik olvasat (tokenre, szóhatáron) PONTOSAN az egyik vitatott olvasatot tartalmazza, az nyer, és a jel lekerül; egyezés
 * nélkül a jel marad. A harmadik olvasó nem ír új szöveget, csak választ a két meglévő közül. Mért: gpt-6.1-sol és Opus 5.5 a
 * Mezopotámia-füzetet szinte hibátlanul olvasta (a két alap-olvasó 11 helyen eltért).
 * Review #192: a keresés sorrendtartó (kurzor); egyoldalú vitánál (az egyik olvasat üres) a nem üres olvasat harmadik olvasatbeli
 * megléte dönt — benne van: marad (jel nélkül), nincs benne: az üres olvasat nyer (a szakasz kikerül).
 */
export function resolveByThirdReading(marked: string, disputes: OcrDisagreement[], third: string): string {
  const keyed = (s: string) => ` ${ocrTokens(s).map(tokenKey).filter(Boolean).join(" ")} `;
  const t3 = keyed(third);
  let out = marked, from = 0;
  for (const d of disputes) {
    const a = keyed(d.first), b = keyed(d.second);
    if (a.trim() === "" && b.trim() === "") continue;
    // a vita jelölt helye (sorrendtartó kurzor) — eldöntetlen vitánál is továbblép, hogy a következő vita ne az ő jelét vigye el
    const hits = [d.first, d.second].map((s) => s.trim()).filter(Boolean)
      .map((span) => ({ span: `${span}${UNCERTAIN_MARK}`, at: out.indexOf(`${span}${UNCERTAIN_MARK}`, from) })).filter((h) => h.at >= 0);
    if (!hits.length) continue;
    const hit = hits.reduce((x, y) => (y.at < x.at ? y : x));
    let hasA: boolean;
    if (a.trim() === "") hasA = !t3.includes(b);
    else if (b.trim() === "") hasA = t3.includes(a);
    else {
      hasA = t3.includes(a);
      if (hasA === t3.includes(b)) { from = hit.at + hit.span.length; continue; }
    }
    const winner = hasA ? d.first.trim() : d.second.trim();
    // az üres olvasat nyer: a szakasz az előtte álló egy szóközzel együtt kikerül
    const start = winner === "" && hit.at > 0 && /[ \t]/.test(out[hit.at - 1]) ? hit.at - 1 : hit.at;
    out = `${out.slice(0, start)}${winner}${out.slice(hit.at + hit.span.length)}`;
    from = start + winner.length;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Spec 2026-10-05-s11/4 — EGYEZŐ félreolvasás: szótár-őr + célzott erős olvasás.
 * Mért (map b6647e0c): mindkét alap-olvasó „Kesia, Föld - Felt. térsége” → nincs vita, nincs jel → hamis tény.
 * ------------------------------------------------------------------ */

/** A célzott újraolvasás kérése: CSAK a sor helye (sorszám, az átirat sorszáma, a jó szomszéd sorok) — a kérdéses olvasat nem. */
export type StrongLineRequest = { n: number; total: number; before?: string; after?: string };
/** Az erős olvasó célzott újraolvasása: sorszám → a sor szövege (hiányzó sor = nincs olvasat). */
export type StrongLinesFn = (file: ExtractorFile, lines: StrongLineRequest[]) => Promise<Map<number, string>>;
export type OcrLexiconGuard = { lexicon: () => Promise<IsWord | null>; strongLines?: StrongLinesFn };

const wordKey = (w: string) => w.normalize("NFC").toLowerCase();

/** A kérdéses szavak MINDEN előfordulása után ⟦?⟧ (review #194: az ismétlődő „Kesia Kesia” mindkét tagja jelölt). */
function markWords(line: string, words: string[]): string {
  const ends = lexiconWordsOf(line).filter((t) => words.some((w) => wordKey(w) === wordKey(t.word))).map((t) => t.end);
  let out = line;
  for (const end of [...new Set(ends)].sort((x, y) => y - x)) if (!out.startsWith(UNCERTAIN_MARK, end)) out = `${out.slice(0, end)}${UNCERTAIN_MARK}${out.slice(end)}`;
  return out;
}

/**
 * A spec 3. pontja soronként (tiszta döntés): `strong` az erős olvasó sorai.
 * - a kérdéses szavak mind megvannak az erős olvasatban (3 olvasó egyezik) → marad, jel nélkül;
 * - eltér, és az erős sor minden szava létező (és a sor nem tévedt el: a jó szavaiból legalább egy közös) → az erős sor lép a helyére;
 * - különben (nem-szó az erős sorban is, hiba, hiány) → a sor minden kérdéses szava után ⟦?⟧.
 */
export function decideNonWordLines(text: string, lines: NonWordLine[], strong: Map<number, string>, isWord: IsWord): { text: string; replaced: { from: string; to: string }[]; kept: { from: string; to: string }[] } {
  const rows = text.split("\n");
  const replaced: { from: string; to: string }[] = [];
  const kept: { from: string; to: string }[] = [];
  for (const { line, words } of lines) {
    const raw = rows[line - 1];
    if (raw === undefined) continue;
    const cr = raw.endsWith("\r") ? "\r" : "";
    const current = cr ? raw.slice(0, -1) : raw;
    const reading = strong.get(line)?.replace(/\r?\n/g, " ").trim() ?? "";
    const strongWords = new Set(lexiconWordsOf(reading).map((t) => wordKey(t.word)));
    const unconfirmed = words.filter((w) => !strongWords.has(wordKey(w)));
    if (reading && unconfirmed.length === 0) continue;
    const anchors = lexiconWordsOf(current).map((t) => t.word).filter((w) => !words.includes(w)).map(wordKey);
    const aligned = anchors.length === 0 || anchors.some((w) => strongWords.has(w));
    // review #194: az erős sor szavai közvetlenül a szótáron (az idegen-szöveg kihagyás itt nem érvényes — a hosszú, zagyva erős sor nem nyerhet)
    if (reading && aligned && lexiconWordsOf(reading).every((t) => passesLexicon(t.word, isWord))) {
      // Spec S11/6 + S9/7 (mért: „Negrid” → „Negroid” — a szótár a tankönyvi alakot nem ismeri): ha az erős olvasat a kérdéses
      // szót csak ≤ 2 betűvel módosítja, a sor többi szavát pedig megerősíti → NINCS csere, NINCS jel (az eredeti marad).
      if (isMinorRevision(current, reading, words)) {
        kept.push({ from: current, to: reading });
        continue;
      }
      replaced.push({ from: current, to: reading });
      rows[line - 1] = `${reading}${cr}`;
      continue;
    }
    // az eltérő sor minden kérdéses szava bizonytalan (a részben egyező „Felt.” is a zagyva sor része)
    rows[line - 1] = `${markWords(current, words)}${cr}`;
  }
  return { text: rows.join("\n"), replaced, kept };
}

/**
 * Spec S11/6 + S9/7: az erős sor csak betűnyi „javítás” — ugyanannyi (ellenőrzött) szó, a nem kérdéses szavak egyeznek (a kontextus
 * megerősít), a kérdéses szavak ≤ 2 szerkesztéssel térnek el. A „Kesia, Föld - Felt.” → „Ázsia, Közel-Kelet” sor NEM ilyen.
 */
function isMinorRevision(current: string, reading: string, questioned: string[]): boolean {
  const cur = lexiconWordsOf(current).map((t) => t.word), str = lexiconWordsOf(reading).map((t) => t.word);
  if (cur.length === 0 || cur.length !== str.length) return false;
  // Review #196: a kérdésesség normalizált kulccsal (kis-/nagybetű, írásjel) — nem nyers szöveg-egyezéssel.
  const asked = new Set(questioned.map(wordKey));
  return cur.every((w, n) => wordKey(w) === wordKey(str[n]) || (asked.has(wordKey(w)) && editDistance(wordKey(w), wordKey(str[n])) <= 2));
}

/**
 * Szótár-őr: a nem-szót tartalmazó sorokat az erős olvasó a képpel FÜGGETLENÜL újraolvassa (a kérdéses olvasatot nem kapja meg),
 * majd soronként `decideNonWordLines` dönt. Nincs nem-szó → nincs hívás. Az erős olvasó hibája/hiánya → ⟦?⟧ (fail-safe).
 * Review #194: a célzott olvasás HIBÁJA átmeneti → `onTransientFailure` (a hívó „degraded”-nek jelöli, a jelölt átirat nem kerül cache-be);
 * a hiányzó erős olvasó konfigurációs állapot (a cache-kulcsban benne van) → nem degraded.
 */
export async function verifyNonWords(text: string, file: ExtractorFile, strongLines: StrongLinesFn | undefined, isWord: IsWord, onTransientFailure?: () => void): Promise<string> {
  const lines = nonWordLines(text, isWord);
  if (lines.length === 0) return text;
  const rows = text.split("\n").map((r) => r.replace(/\r$/, ""));
  const questioned = new Set(lines.map((l) => l.line));
  const neighbour = (n: number) => (n >= 1 && n <= rows.length && !questioned.has(n) && rows[n - 1].trim() ? rows[n - 1].trim() : undefined);
  const requests: StrongLineRequest[] = lines.map(({ line }) => ({ n: line, total: rows.length, before: neighbour(line - 1), after: neighbour(line + 1) }));
  logger.info(`[STUDIO/OCR] ${file.name}: ${lines.length} sorban szótárban nem szereplő szó (${lines.flatMap((l) => l.words).slice(0, 12).join(", ")}) — célzott erős olvasás.`);
  let strong = new Map<number, string>();
  if (!strongLines) logger.warn(`[STUDIO/OCR] ${file.name}: nincs erős olvasó — a kérdéses szavak ⟦?⟧ jelet kapnak.`);
  else {
    try {
      strong = await strongLines(file, requests);
    } catch (error) {
      onTransientFailure?.();
      logger.warn(`[STUDIO/OCR] ${file.name}: degraded — az erős olvasó célzott olvasása hibázott (${error instanceof Error ? error.message : String(error)}) — a kérdéses szavak ⟦?⟧ jelet kapnak.`);
    }
  }
  const decided = decideNonWordLines(text, lines, strong, isWord);
  for (const r of decided.replaced) logger.info(`[STUDIO/OCR] ${file.name}: szótár-őr csere „${r.from.slice(0, 120)}” → „${r.to.slice(0, 120)}”.`);
  for (const r of decided.kept) logger.info(`[STUDIO/OCR] ${file.name}: szótár-őr — az erős olvasat csak ≤ 2 betűvel tér el („${r.to.slice(0, 120)}”), az eredeti marad: „${r.from.slice(0, 120)}”.`);
  return decided.text;
}

export const OCR_LINE_REREAD_PROMPT = withRoleSkill("ocr", [
  "You re-read SPECIFIC LINES of a photographed Hungarian school page, independently, from the image only.",
  "Each request gives a line number counted in reading order (top to bottom, columns separately) out of the page's lines, and the neighbouring lines' text to locate it.",
  "Transcribe exactly what is written on that line, following the skill's handwriting procedure; if a word stays doubtful, write your best reading followed by ⟦?⟧.",
  "Output format for THIS call overrides the skill's plain-text rule: only JSON {\"lines\":[{\"n\":<line number>,\"text\":\"<the line>\"}]}, one entry per requested line.",
].join(" "));

/** Tolerant parse of the strong reader's JSON (code fence / prose around it allowed). */
export function parseStrongLines(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Az erős olvasó válasza nem JSON.");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { lines?: unknown };
  if (!Array.isArray(parsed.lines)) throw new Error("Az erős olvasó válaszából hiányzik a lines lista.");
  for (const entry of parsed.lines as { n?: unknown; text?: unknown }[]) {
    if (typeof entry?.n === "number" && Number.isInteger(entry.n) && typeof entry.text === "string" && entry.text.trim()) out.set(entry.n, entry.text.trim());
  }
  return out;
}

/** The targeted strong re-read: the image + line locations only (never the base readings of the questioned lines). */
export async function callOcrStrongLines(file: ExtractorFile, model: string, lines: StrongLineRequest[]): Promise<Map<number, string>> {
  const OpenAI = (await import("openai")).default;
  return withQuotaFailover(studioConnection(model), async (connection) => {
    const client = new OpenAI({ baseURL: connection.baseURL, apiKey: connection.apiKey, timeout: 120000, maxRetries: 0 });
    const base = ocrRequestParams(connection.model, file.content);
    const text = `Olvasd újra a lap alábbi sorait (a lap ${lines[0]?.total ?? "?"} sorából):\n${lines.slice(0, 40).map((l) =>
      `- ${l.n}. sor${l.before ? `; előtte álló sor: „${l.before}”` : ""}${l.after ? `; utána álló sor: „${l.after}”` : ""}`).join("\n")}`;
    const params = { ...base, max_completion_tokens: 3000, messages: [
      { role: "system" as const, content: OCR_LINE_REREAD_PROMPT },
      { role: "user" as const, content: [{ type: "text" as const, text }, ...base.messages[1].content] },
    ] };
    const request = ocrVendorRequest(connection.vendor, params);
    const response = await client.chat.completions.create(request as unknown as Parameters<typeof client.chat.completions.create>[0]);
    if (!("choices" in response)) return new Map<number, string>();
    if (response.choices[0]?.finish_reason !== "stop") throw new Error("Az erős olvasó válasza csonkolt.");
    return parseStrongLines(response.choices[0]?.message?.content ?? "");
  });
}

export type OcrAdjudicator = (file: ExtractorFile, first: string, disputes: OcrDisagreement[]) => Promise<string>;

/** Dual-read OCR for images; PDFs and failures fall back to the first read (fail-open, as before). */
/**
 * Audit 2026-09-24: a leromlott eredményt (egyik olvasó vagy a döntés hibázott) a cache NEM tárolhatja —
 * különben egy átmeneti 429/időtúllépés után az adott képre soha többé nem futna kettős olvasás.
 */
export type DualReadOcr = OcrFn & { degraded(file: ExtractorFile): boolean };

/**
 * Spec 2026-10-05-s11/4: a végső képátirat szótár-őrön megy át; szótár-hiba / célzott olvasás hibája → `degrade()` (nem cache-elhető).
 */
async function applyLexiconGuard(file: ExtractorFile, text: string, guard: OcrLexiconGuard | undefined, degrade: () => void): Promise<string> {
  if (!guard || file.kind !== "image" || !text.trim()) return text;
  const isWord = await guard.lexicon();
  if (!isWord) {
    degrade();
    logger.warn(`[STUDIO/OCR] ${file.name}: degraded — szótár nélkül, a szótár-őr kimaradt.`);
    return text;
  }
  try {
    return await verifyNonWords(text, file, guard.strongLines, isWord, degrade);
  } catch (error) {
    degrade();
    logger.warn(`[STUDIO/OCR] ${file.name}: degraded — a szótár-őr hibázott (${error instanceof Error ? error.message : String(error)}).`);
    return text;
  }
}

/** Review #194: az egyolvasós út (nincs második olvasó) is szótár-őrön megy át — a végső átirat mindig ellenőrzött. */
export function lexiconGuardedOcr(ocr: OcrFn, guard: OcrLexiconGuard): DualReadOcr {
  const degradedFiles = new WeakSet<ExtractorFile>();
  const read = async (file: ExtractorFile): Promise<string> => {
    degradedFiles.delete(file);
    return applyLexiconGuard(file, await ocr(file), guard, () => degradedFiles.add(file));
  };
  return Object.assign(read, { degraded: (file: ExtractorFile) => degradedFiles.has(file) });
}

/** `opts.adjudicatorDecides` (spec S11/5): az erős elsődleges olvasónál a sikeres döntő olvasás dönt — jel csak a saját bizonytalanságánál
 *  (⟦?⟧), a harmadik alaknál és a szótár-őrnél; a döntő olvasás elvetésekor a régi, vita-alapú jelölés marad. */
export function dualReadOcr(first: OcrFn, second: OcrFn, adjudicate: OcrAdjudicator, third?: OcrFn, guard?: OcrLexiconGuard, opts: { adjudicatorDecides?: boolean; substitute?: OcrFn } = {}): DualReadOcr {
  const degradedFiles = new WeakSet<ExtractorFile>();
  // Spec 2026-10-05-s11/4: a végső (settle utáni) képátirat szótár-őrön megy át; szótár-hiba → változatlan szöveg, „degraded”.
  const guarded = (file: ExtractorFile, text: string): Promise<string> => applyLexiconGuard(file, text, guard, () => degradedFiles.add(file));
  // Spec 2026-10-05-s11/2: ha jelölt vita maradt, a független harmadik olvasat dönt (2 a 3-ból); hibánál a jelölt átirat marad.
  // `voter: null` = nincs független szavazó (a helyettesítő erős olvasat már az egyik olvasat) — NEM az alapértelmezett harmadik olvasó.
  const settle = async (file: ExtractorFile, marked: string, disputes: OcrDisagreement[], voter: OcrFn | null): Promise<string> => {
    if (!voter || !marked.includes(UNCERTAIN_MARK)) return marked;
    try {
      const resolved = resolveByThirdReading(marked, disputes, await voter(file));
      const left = resolved.split(UNCERTAIN_MARK).length - 1, before = marked.split(UNCERTAIN_MARK).length - 1;
      logger.info(`[STUDIO/OCR] ${file.name}: harmadik olvasat — ${before - left}/${before} vitatott hely feloldva (2 a 3-ból).`);
      return resolved;
    } catch (error) {
      logger.warn(`[STUDIO/OCR] ${file.name}: a harmadik olvasat hibázott (${error instanceof Error ? error.message : String(error)}) — a jelölt átirat marad.`);
      return marked;
    }
  };
  const readCore = async (file: ExtractorFile): Promise<string> => {
    degradedFiles.delete(file);
    if (file.kind !== "image") return first(file);
    const [a, b] = await Promise.allSettled([first(file), second(file)]);
    const usable = (r: PromiseSettledResult<string>) => (r.status === "fulfilled" && r.value.trim() ? r.value : null);
    let primary = usable(a), other = usable(b);
    let voter: OcrFn | null = third ?? null;
    // Spec 2026-10-05-s11/3 (mért: a második olvasó NÉMÁN kiesett → ellenőrizetlen egyetlen olvasat → „a Föld keleti térsége” tény lett):
    // a kiesés naplózva, és az erős olvasó lép a helyére — mindig két független olvasat.
    if (!primary || !other) {
      const failed = !primary ? a : b;
      const reason = failed.status === "rejected" ? (failed.reason instanceof Error ? failed.reason.message : String(failed.reason)) : "üres válasz";
      logger.warn(`[STUDIO/OCR] ${file.name}: ${!primary ? "az első" : "a második"} olvasó kiesett (${reason.slice(0, 200)})${third ? " — az erős olvasó lép a helyére." : opts.substitute ? " — a helyettesítő olvasó lép a helyére." : "."}`);
      // Review #195: helyettesítő olvasó külön is megadható (erős elsődlegesnél nincs szavazó, de a kiesést pótolni kell).
      const replacement = third ?? opts.substitute;
      if (replacement) {
        try {
          const substitute = (await replacement(file)).trim();
          if (substitute) { if (!primary) primary = substitute; else other = substitute; voter = null; }
        } catch (error) {
          logger.warn(`[STUDIO/OCR] ${file.name}: az erős olvasó is kiesett (${error instanceof Error ? error.message : String(error)}).`);
        }
      }
      if (!primary || !other) {
        degradedFiles.add(file);
        if (primary || other) return (primary ?? other)!;
        throw a.status === "rejected" ? a.reason : new Error("Az OCR egyik olvasója sem adott szöveget.");
      }
    }
    const located = locateOcrDisagreements(primary, other);
    const disputes: OcrDisagreement[] = located.map(({ first: f, second: s2 }) => ({ first: f, second: s2 }));
    if (disputes.length === 0) return primary;
    logger.info(`[STUDIO/OCR] ${file.name}: a két olvasat ${disputes.length} helyen eltér — döntő olvasás a képpel.`);
    try {
      const decided = (await adjudicate(file, primary, disputes)).trim();
      if (decided && adjudicationStaysInDispute(primary, decided, disputes)) return settle(file, markUnresolvedDisputes(decided, located, primary, { thirdFormOnly: opts.adjudicatorDecides }), disputes, voter);
      logger.warn(`[STUDIO/OCR] ${file.name}: a döntő olvasat a vitatott helyeken kívül is változtatott — az első olvasat marad.`);
    } catch (error) {
      logger.warn(`[STUDIO/OCR] ${file.name}: a döntő olvasás hibázott (${error instanceof Error ? error.message : String(error)}) — az első olvasat marad.`);
    }
    degradedFiles.add(file);
    // Spec 2026-10-05-s11 (mérve: a döntő olvasat elvetése után a vita nyoma elveszett — „Kesia, Föld - Felt.”, „határak” jel nélkül):
    // az első olvasat megtartásakor is jelölt az érdemi eltérés.
    return settle(file, markUnresolvedDisputes(primary, located, primary), disputes, voter);
  };
  const read = async (file: ExtractorFile): Promise<string> => guarded(file, await readCore(file));
  return Object.assign(read, { degraded: (file: ExtractorFile) => degradedFiles.has(file) });
}

export const OCR_ADJUDICATION_PROMPT = withRoleSkill("ocr", [
  "Two independent transcriptions of the same photographed Hungarian school page disagree in the listed places.",
  "Look at the image again and return the FIRST transcription unchanged EXCEPT at the listed disagreements, where you write what is actually on the page.",
  "At a disagreement, choose the reading that matches the handwriting; use the context only to decide between letter shapes (e.g. k/b, h/f), never to add or reword content.",
  "If the handwriting still does not decide a disagreement, write the more likely reading followed by the mark ⟦?⟧ — never a confident-looking guess.",
  "Output plain text only — the full corrected transcription.",
].join(" "));

/** The adjudication call: the image + the first read + the disputed spans. */
export async function callOcrAdjudicator(file: ExtractorFile, model: string, first: string, disputes: OcrDisagreement[]): Promise<string> {
  const OpenAI = (await import("openai")).default;
  return withQuotaFailover(studioConnection(model), async (connection) => {
  const client = new OpenAI({ baseURL: connection.baseURL, apiKey: connection.apiKey, timeout: 120000, maxRetries: 0 });
  const base = ocrRequestParams(connection.model, file.content);
  const text = `Első átirat:\n<<<\n${first}\n>>>\nEltérések (első olvasat → második olvasat):\n${disputes.slice(0, 80).map((d, n) => `${n + 1}. „${d.first}” ↔ „${d.second}”`).join("\n")}`;
  const params = { ...base, messages: [
    { role: "system" as const, content: OCR_ADJUDICATION_PROMPT },
    { role: "user" as const, content: [{ type: "text" as const, text }, ...base.messages[1].content] },
  ] };
  const request = ocrVendorRequest(connection.vendor, params);
  const response = await client.chat.completions.create(request as unknown as Parameters<typeof client.chat.completions.create>[0]);
  if ("choices" in response) {
    if (response.choices[0]?.finish_reason !== "stop") throw new Error("A döntő átirat csonkolt.");
    return response.choices[0]?.message?.content?.trim() ?? "";
  }
  return "";
  });
}

/** The searchable source text: base text sources + non-empty OCR transcripts. */
export function mergeOcrIntoSourceText(baseText: string, ocrResults: OcrResult[]): string {
  const parts = [baseText, ...ocrResults.filter((r) => r.text.trim() !== "").map((r) => r.text)];
  return parts.filter((p) => p !== "").join("\n");
}

// Szerep-skill (2026-09-19) az elején; az OCR cache-kulcs a promptot tartalmazza, így skill-módosítás új átiratot kér.
export const OCR_SYSTEM_PROMPT = withRoleSkill("ocr", [
  "You are a verbatim transcriber for Hungarian school material photographed or screenshotted by a teacher.",
  "Transcribe ALL legible text from the image EXACTLY as written — same wording, same accents, same punctuation.",
  "Do not translate, summarize, correct, or reorder anything. Do not describe the image.",
  "For handwriting, follow the skill's „Magyar kézírás” procedure: write the letters the writer INTENDED (resolve letter-shape confusions by the Hungarian word and the topic), never a non-existent word where a close real one stands on the page, and never fix the writer's own content mistakes.",
  "Output plain text only.",
].join(" "));

/**
 * Az OCR-kérés paraméterei — a #165 gyökér-okkal azonos hibaosztály ellen
 * pin-elve: a glm-flash osztálynál a reasoning kötelező és keretet fogyaszt,
 * ezért effort:low + bő completion-keret (a 4096 az átiratnak kell).
 */
/**
 * Spec 2026-10-05-s11/7: a kimeneti keret az efforthoz igazodik — a gondolkodás is ebből fogy, a high-effortú erős olvasót a 6000-es
 * keret csonkolná (a low változatlan).
 */
export const OCR_COMPLETION_BUDGET: Readonly<Record<OcrEffort, number>> = { low: 6000, medium: 16_000, high: 32_000 };
/** A kérés határideje effort szerint (a high gondolkodás tovább tart; a low változatlan). */
const OCR_TIMEOUT_MS: Readonly<Record<OcrEffort, number>> = { low: 120_000, medium: 240_000, high: 300_000 };

export function ocrRequestParams(model: string, imageDataUrl: string, effort: OcrEffort = "low") {
  return {
    model,
    messages: [
      { role: "system" as const, content: OCR_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [{ type: "image_url" as const, image_url: { url: imageDataUrl, detail: "high" as const } }],
      },
    ],
    max_completion_tokens: OCR_COMPLETION_BUDGET[effort],
    reasoning: { effort },
  };
}

/**
 * Vendor-specific reasoning control: OpenRouter takes `reasoning`, the direct OpenAI API (GPT-5.6 Luna)
 * takes `reasoning_effort` — without it the default effort can spend the completion budget on thinking.
 */
export function ocrVendorRequest<T extends { reasoning?: { effort: OcrEffort } }>(vendor: string, params: T) {
  if (vendor === "openrouter") return params;
  const { reasoning, ...rest } = params;
  return vendor === "openai" ? { ...rest, reasoning_effort: reasoning?.effort ?? ("low" as const) } : rest;
}

/** The default OCR callable: one cheap vision call per image. `effort` (spec S11/7): az erős olvasó high efforttal, nagyobb kerettel. */
export async function callOcrModel(file: ExtractorFile, model: string, effort: OcrEffort = "low"): Promise<string> {
  const OpenAI = (await import("openai")).default;
  // Spec 2026-10-01-gyokerok-egyben (2.3): kimerült OpenAI-keretnél ugyanaz a modell az OpenRouteren át.
  return withQuotaFailover(studioConnection(model), async (connection) => {
  const client = new OpenAI({ baseURL: connection.baseURL, apiKey: connection.apiKey, timeout: OCR_TIMEOUT_MS[effort], maxRetries: 1 });

  const imageParams = ocrRequestParams(connection.model, file.content, effort);
  const params = file.kind === "pdf" ? { ...imageParams, max_completion_tokens: Math.max(24000, imageParams.max_completion_tokens),
    messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT + " Transcribe every PDF page and label its page number. Preserve formulas and units. Mark unreadable text explicitly." },
      { role: "user", content: [{ type: "file", file: { filename: file.name, file_data: file.content } }] },
    ] } : imageParams;
  const request = ocrVendorRequest(connection.vendor, params);
  // The reasoning extension is only sent to OpenRouter.
  const response = await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  );
  if ("choices" in response) {
    if (response.choices[0]?.finish_reason !== "stop") throw new Error("A forrás átírása csonkolt; teljes szöveg szükséges.");
    return response.choices[0]?.message?.content?.trim() ?? "";
  }
  return "";
  });
}

/* ------------------------------------------------------------------ *
 * Spec 2026-10-05-s11/7 — KÉT ERŐS OLVASÓ FÚZIÓJA (tulajdonosi döntés a friss 4-lapos futás után).
 * Mért (map d344e889): az erős+gyenge módszer döntő olvasója a vitán KÍVÜL is átírt („A világ [olvashatatlan] 1260” →
 * „II. világháború 1939”), így a döntés elveszett, és minden vita jelet kapott → „túl bizonytalan” megállás.
 * Itt a döntő CSAK választ vitánként (A | B | own); a végső szöveget a kód rakja össze az A-ból — a vitákon kívül semmi nem
 * változhat (szerkezetileg). `own` → a saját alak minden új szava ⟦?⟧; hiányzó/érvénytelen döntés → az A alakja ⟦?⟧-lel.
 * ------------------------------------------------------------------ */

export type OcrFusionPick = "A" | "B" | "own";
export type OcrFusionChoice = { n: number; pick: OcrFusionPick; text?: string };
/** A döntőnek küldött, sorszámozott vita: a két olvasat szakasza és az A-beli sor (hely-kontextus). */
export type OcrFusionDispute = { n: number; a: string; b: string; line: string };
export type OcrFusionDecider = (file: ExtractorFile, a: string, b: string, disputes: OcrFusionDispute[]) => Promise<OcrFusionChoice[]>;
export type OcrFusionStats = { A: number; B: number; own: number; missing: number };

/** Egy döntő hívásban legfeljebb ennyi vita (fölötte: hiányzó döntés → az A alakja jellel). */
export const MAX_FUSION_DISPUTES = 150;

type OffsetToken = { text: string; start: number; end: number };
const offsetTokens = (text: string): OffsetToken[] =>
  [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
const bareWordOf = (token: string) => tokenKey(token.split(UNCERTAIN_MARK).join("")).replace(/[^\p{L}\p{N}]/gu, "");

/** ⟦?⟧ minden olyan szó után, amely nincs a `known` szavak közt (a már jelölt / ismert token változatlan). */
function markUnknownWords(text: string, known: ReadonlySet<string>): { text: string; marks: number } {
  let marks = 0;
  const out = text.replace(/\S+/g, (token) => {
    const word = bareWordOf(token);
    if (!word || known.has(word)) return token;
    marks++;
    return `${token.split(UNCERTAIN_MARK).join("")}${UNCERTAIN_MARK}`;
  });
  return { text: out, marks };
}
const withTrailingMark = (text: string) => (text.trimEnd().endsWith(UNCERTAIN_MARK) ? text.trimEnd() : `${text.trimEnd()}${UNCERTAIN_MARK}`);

type FusionItem = { span: TokenSpan; aText: string; bText: string; n: number | null; sepAfter: string; sepBefore: string };

/** A két olvasat eltérései szó-szinten; `n` csak a szó-szintű vitáé (a csak-írásjel/nyíl/szóköz eltérés S11/6 szerint nem vita → A). */
function fusionPlan(a: string, b: string): { items: FusionItem[]; ta: OffsetToken[]; disputes: OcrFusionDispute[] } {
  const ta = offsetTokens(a), tb = offsetTokens(b);
  const spans = diffTokenSpans(ta.map((t) => t.text), tb.map((t) => t.text))
    ?? (ta.map((t) => t.text).join(" ") === tb.map((t) => t.text).join(" ") ? [] : [{ aStart: 0, aEnd: ta.length, bStart: 0, bEnd: tb.length }]);
  const slice = (text: string, toks: OffsetToken[], s: number, e: number) => (s < e ? text.slice(toks[s].start, toks[e - 1].end) : "");
  const gap = (text: string, toks: OffsetToken[], k: number) => (k > 0 && k < toks.length ? text.slice(toks[k - 1].end, toks[k].start) : "");
  const lineAt = (offset: number) => {
    const from = offset > 0 ? a.lastIndexOf("\n", offset - 1) + 1 : 0;
    const to = a.indexOf("\n", offset);
    return a.slice(from, to === -1 ? a.length : to).trim().slice(0, 200);
  };
  const disputes: OcrFusionDispute[] = [];
  // A szakasz széléről a szó nélküli (írásjel/nyíl) tokenek az A-nál maradnak — különben a B választása az A nyilát/soremelését is
  // elvinné („határak\n→” ↔ „katonák”); S11/6: a csak-írásjel eltérés nem vita.
  const wordless = (t: OffsetToken) => wordsOf(t.text).length === 0;
  const trim = (toks: OffsetToken[], s: number, e: number): [number, number] => {
    while (e > s && wordless(toks[e - 1])) e--;
    while (s < e && wordless(toks[s])) s++;
    return [s, e];
  };
  const items = spans.map((raw): FusionItem => {
    const [aStart, aEnd] = trim(ta, raw.aStart, raw.aEnd), [bStart, bEnd] = trim(tb, raw.bStart, raw.bEnd);
    const span = { aStart, aEnd, bStart, bEnd };
    const aText = slice(a, ta, span.aStart, span.aEnd), bText = slice(b, tb, span.bStart, span.bEnd);
    let n: number | null = null;
    if (wordKeyedOf(aText) !== wordKeyedOf(bText)) {
      n = disputes.length + 1;
      const at = span.aStart < ta.length ? ta[span.aStart].start : a.length;
      disputes.push({ n, a: aText, b: bText, line: lineAt(at) });
    }
    return { span, aText, bText, n, sepAfter: /\n/.test(gap(b, tb, span.bEnd)) ? "\n" : " ", sepBefore: /\n/.test(gap(b, tb, span.bStart)) ? "\n" : " " };
  });
  return { items, ta, disputes };
}

/** A döntőnek küldendő, sorszámozott viták (ugyanaz a determinisztikus terv, mint az összerakásé). */
export function ocrFusionDisputes(a: string, b: string): OcrFusionDispute[] {
  return fusionPlan(a, b).disputes;
}

/** Érvényes döntések sorszám szerint; ütköző ismétlés vagy hibás bejegyzés → nincs döntés (az A alakja jellel). */
function validChoices(choices: readonly OcrFusionChoice[], count: number): Map<number, OcrFusionChoice> {
  const out = new Map<number, OcrFusionChoice>();
  const bad = new Set<number>();
  for (const c of choices) {
    if (!c || !Number.isInteger(c.n) || c.n < 1 || c.n > count) continue;
    const ok = c.pick === "A" || c.pick === "B" || (c.pick === "own" && typeof c.text === "string" && c.text.trim() !== "");
    const prev = out.get(c.n);
    if (!ok || (prev && (prev.pick !== c.pick || prev.text !== c.text))) { bad.add(c.n); continue; }
    out.set(c.n, c);
  }
  for (const n of bad) out.delete(n);
  return out;
}

/**
 * Spec S11/7 — DETERMINISZTIKUS összerakás az A olvasatból: csak a szó-szintű viták szakaszai cserélődnek (A | B | own), minden más
 * bájtra az A marad. `own` → minden, egyik olvasatban sem szereplő szava ⟦?⟧ (ha nincs ilyen, a szakasz vége); hiányzó/érvénytelen
 * döntés → az A alakja, a B-ben nem szereplő szavai ⟦?⟧-lel (üres A-oldalnál önálló ⟦?⟧ a vita helyén).
 */
export function fuseOcrReadings(a: string, b: string, choices: readonly OcrFusionChoice[]): { text: string; stats: OcrFusionStats } {
  const { items, ta, disputes } = fusionPlan(a, b);
  const decided = validChoices(choices, Math.min(disputes.length, MAX_FUSION_DISPUTES));
  const stats: OcrFusionStats = { A: 0, B: 0, own: 0, missing: 0 };
  const resolve = (it: FusionItem): string => {
    if (it.n === null) return it.aText;
    const choice = decided.get(it.n);
    if (choice?.pick === "A") { stats.A++; return it.aText; }
    if (choice?.pick === "B") { stats.B++; return it.bText; }
    if (choice?.pick === "own" && choice.text) {
      stats.own++;
      const own = choice.text.replace(/\s+/g, " ").trim();
      const bare = own.split(UNCERTAIN_MARK).join("").replace(/\s+/g, " ").trim();
      const selfMarked = own.includes(UNCERTAIN_MARK);
      if (!selfMarked && wordKeyedOf(bare) === wordKeyedOf(it.aText)) return it.aText;
      if (!selfMarked && wordKeyedOf(bare) === wordKeyedOf(it.bText)) return it.bText;
      const marked = markUnknownWords(bare, new Set([...wordsOf(it.aText), ...wordsOf(it.bText)]));
      return marked.marks > 0 ? marked.text : withTrailingMark(marked.text);
    }
    stats.missing++;
    if (!it.aText) return UNCERTAIN_MARK;
    const marked = markUnknownWords(it.aText, new Set(wordsOf(it.bText)));
    return marked.marks > 0 ? marked.text : withTrailingMark(marked.text);
  };
  let out = "", cursor = 0;
  for (const it of items) {
    const replacement = resolve(it);
    const { aStart, aEnd } = it.span;
    if (aEnd > aStart) {
      const start = ta[aStart].start, end = ta[aEnd - 1].end;
      let head = a.slice(cursor, start);
      cursor = end;
      if (replacement === "") {
        head = head.replace(/[ \t]+$/, "");
        if (head === "" || head.endsWith("\n")) cursor += (/^[ \t]*/.exec(a.slice(end))?.[0].length ?? 0);
      }
      out += head + replacement;
    } else if (replacement !== "") {
      const markOnly = replacement === UNCERTAIN_MARK;
      if (aStart < ta.length) {
        const pos = ta[aStart].start;
        out += a.slice(cursor, pos) + replacement + (markOnly ? " " : it.sepAfter);
        cursor = pos;
      } else {
        const pos = ta.length ? ta[ta.length - 1].end : 0;
        out += a.slice(cursor, pos) + (pos > 0 ? (markOnly ? " " : it.sepBefore) : "") + replacement;
        cursor = pos;
      }
    }
  }
  return { text: out + a.slice(cursor), stats };
}

/**
 * Spec S11/7: két erős, független olvasó (párhuzamosan) + fúziós döntés + szótár-őr a végén.
 * Kiesés: a másik olvasó egyedül (+ szótár-őr), naplózva, „degraded” (nem kerül cache-be); mindkettő kiesik → hiba.
 * A döntő hívás hibája → az A olvasat a viták jelölésével, „degraded” (a következő futás újrapróbálja).
 * Nem kép (PDF): az A olvas; kiesésekor a B, „degraded”.
 */
export function fusionOcr(readerA: OcrFn, readerB: OcrFn, decide: OcrFusionDecider, guard?: OcrLexiconGuard): DualReadOcr {
  const degradedFiles = new WeakSet<ExtractorFile>();
  const reasonOf = (r: PromiseSettledResult<string>) =>
    (r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : "üres válasz").slice(0, 200);
  const usable = (r: PromiseSettledResult<string>) => (r.status === "fulfilled" && r.value.trim() ? r.value : null);
  const readCore = async (file: ExtractorFile): Promise<string> => {
    if (file.kind !== "image") {
      const [ra] = await Promise.allSettled([readerA(file)]);
      const a = usable(ra);
      if (a) return a;
      degradedFiles.add(file);
      logger.warn(`[STUDIO/OCR] ${file.name}: degraded — az A olvasó kiesett (${reasonOf(ra)}) — a B olvasó olvas.`);
      return readerB(file);
    }
    const [ra, rb] = await Promise.allSettled([readerA(file), readerB(file)]);
    const a = usable(ra), b = usable(rb);
    if (!a || !b) {
      if (!a && !b) {
        logger.warn(`[STUDIO/OCR] ${file.name}: mindkét erős olvasó kiesett (A: ${reasonOf(ra)}; B: ${reasonOf(rb)}).`);
        throw ra.status === "rejected" ? ra.reason : rb.status === "rejected" ? rb.reason : new Error("Az OCR egyik olvasója sem adott szöveget.");
      }
      degradedFiles.add(file);
      logger.warn(`[STUDIO/OCR] ${file.name}: degraded — ${!a ? `az A olvasó kiesett (${reasonOf(ra)})` : `a B olvasó kiesett (${reasonOf(rb)})`} — a másik olvasat egyedül megy tovább (szótár-őrrel).`);
      return (a ?? b) as string;
    }
    const disputes = ocrFusionDisputes(a, b);
    if (disputes.length === 0) return a;
    logger.info(`[STUDIO/OCR] ${file.name}: a két erős olvasat ${disputes.length} helyen tér el — fúziós döntés a képpel.`);
    let choices: OcrFusionChoice[] = [];
    try {
      choices = await decide(file, a, b, disputes.slice(0, MAX_FUSION_DISPUTES));
    } catch (error) {
      degradedFiles.add(file);
      logger.warn(`[STUDIO/OCR] ${file.name}: degraded — a fúziós döntés hibázott (${error instanceof Error ? error.message : String(error)}) — az A olvasat, a viták jelölve.`);
    }
    const fused = fuseOcrReadings(a, b, choices);
    logger.info(`[STUDIO/OCR] ${file.name}: fúzió — A: ${fused.stats.A}, B: ${fused.stats.B}, saját: ${fused.stats.own}, döntés nélkül (jelölve): ${fused.stats.missing}.`);
    return fused.text;
  };
  const read = async (file: ExtractorFile): Promise<string> => {
    degradedFiles.delete(file);
    const text = await readCore(file);
    return applyLexiconGuard(file, text, guard, () => degradedFiles.add(file));
  };
  return Object.assign(read, { degraded: (file: ExtractorFile) => degradedFiles.has(file) });
}

export const OCR_FUSION_DECIDER_PROMPT = withRoleSkill("ocr", [
  "Two strong, independent transcriptions (A and B) of the same photographed Hungarian school page differ in the numbered places listed by the user.",
  "Look at the image and decide EACH numbered place on its own: \"A\" if reading A is what is written there, \"B\" if reading B is, or \"own\" with your reading in \"text\" when neither matches the handwriting.",
  "Decide by the letters on the page; use the context only to resolve letter shapes (e.g. k/b, h/f), never to reword, complete or correct the writer's content.",
  "If the handwriting still does not decide a place, choose \"own\" and end the doubtful word with ⟦?⟧ — never a confident-looking guess.",
  "Nothing outside the numbered places can be changed; do not rewrite the page.",
  "Output format for THIS call overrides the skill's plain-text rule: only JSON {\"choices\":[{\"n\":<number>,\"pick\":\"A\"|\"B\"|\"own\",\"text\":\"<only with own>\"}]}, exactly one entry per numbered place.",
].join(" "));

/** Tolerant parse of the fusion decider's JSON (code fence / prose around it allowed); structurally invalid entries are dropped. */
export function parseFusionChoices(raw: string): OcrFusionChoice[] {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A fúziós döntés válasza nem JSON.");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { choices?: unknown };
  if (!Array.isArray(parsed.choices)) throw new Error("A fúziós döntés válaszából hiányzik a choices lista.");
  return (parsed.choices as { n?: unknown; pick?: unknown; text?: unknown }[]).flatMap((c): OcrFusionChoice[] =>
    typeof c?.n === "number" && (c.pick === "A" || c.pick === "B" || c.pick === "own")
      ? [{ n: c.n, pick: c.pick, ...(typeof c.text === "string" ? { text: c.text } : {}) }]
      : []);
}

/** A döntő hívás szövege: a két teljes olvasat és a sorszámozott viták. */
export function fusionDeciderText(a: string, b: string, disputes: OcrFusionDispute[]): string {
  const q = (s: string) => (s ? `„${s}”` : "(nincs ilyen szöveg)");
  return `A olvasat:\n<<<\n${a}\n>>>\nB olvasat:\n<<<\n${b}\n>>>\nVitatott helyek (sorszám. A ↔ B; a hely sora az A olvasatból):\n${disputes.map((d) =>
    `${d.n}. A: ${q(d.a)} ↔ B: ${q(d.b)} — sor: „${d.line}”`).join("\n")}`;
}

/** The fusion decision call: the image + both readings + the numbered disputes → JSON choices (never the final text). */
export async function callOcrFusionDecider(file: ExtractorFile, model: string, effort: OcrEffort, a: string, b: string, disputes: OcrFusionDispute[]): Promise<OcrFusionChoice[]> {
  const text = fusionDeciderText(a, b, disputes);
  if (providerForModel(model) === "anthropic") return parseFusionChoices(await callClaudeVision(file, model, effort, OCR_FUSION_DECIDER_PROMPT, text));
  const OpenAI = (await import("openai")).default;
  return withQuotaFailover(studioConnection(model), async (connection) => {
    const client = new OpenAI({ baseURL: connection.baseURL, apiKey: connection.apiKey, timeout: OCR_TIMEOUT_MS[effort], maxRetries: 0 });
    const base = ocrRequestParams(connection.model, file.content, effort);
    const params = { ...base, response_format: { type: "json_object" as const }, messages: [
      { role: "system" as const, content: OCR_FUSION_DECIDER_PROMPT },
      { role: "user" as const, content: [{ type: "text" as const, text }, ...base.messages[1].content] },
    ] };
    const request = ocrVendorRequest(connection.vendor, params);
    const response = await client.chat.completions.create(request as unknown as Parameters<typeof client.chat.completions.create>[0]);
    if (!("choices" in response)) throw new Error("A fúziós döntés nem adott választ.");
    if (response.choices[0]?.finish_reason !== "stop") throw new Error("A fúziós döntés válasza csonkolt.");
    return parseFusionChoices(response.choices[0]?.message?.content ?? "");
  });
}

/* ---- Spec S11/7: a Claude-olvasó (Anthropic SDK, adaptive thinking, `output_config.effort`) ---- */

/** A Claude-olvasó kimeneti kerete (a gondolkodás is ebből fogy; streamelve, így a hosszú kérés nem fut időtúllépésbe). */
export const CLAUDE_OCR_MAX_TOKENS = 32_000;
const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];
/** A teszt mockolt klienst ad; élesben az SDK kliense. */
export type ClaudeMessagesClient = { messages: { stream(params: Anthropic.MessageStreamParams): { finalMessage(): Promise<Anthropic.Message> } } };

/** A forrásfájl Claude-tartalomblokkja: kép → `image`, PDF → `document` (base64). */
export function claudeSourceBlock(file: ExtractorFile): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(file.content);
  if (!m) throw new Error(`A(z) ${file.name} tartalma nem base64 data URL — a Claude-olvasó nem kapja meg.`);
  const [, mediaType, data] = m;
  if (file.kind === "pdf" || mediaType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  if (!(CLAUDE_IMAGE_TYPES as readonly string[]).includes(mediaType)) throw new Error(`A Claude-olvasó nem támogatja a(z) ${mediaType} formátumot.`);
  return { type: "image", source: { type: "base64", media_type: mediaType as ClaudeImageType, data } };
}

async function callClaudeVision(file: ExtractorFile, model: string, effort: OcrEffort, system: string, text: string | null, client?: ClaudeMessagesClient): Promise<string> {
  const connection = studioConnection(model);
  const anthropic: ClaudeMessagesClient = client ?? new Anthropic({ apiKey: connection.apiKey, baseURL: connection.baseURL, timeout: OCR_TIMEOUT_MS[effort], maxRetries: 1 });
  const content: Anthropic.ContentBlockParam[] = [claudeSourceBlock(file), ...(text ? [{ type: "text" as const, text }] : [])];
  // Claude Opus 5.5: a gondolkodás adaptív (budget_tokens nincs), a mélységet az `output_config.effort` adja.
  const message = await anthropic.messages.stream({
    model: connection.model,
    max_tokens: CLAUDE_OCR_MAX_TOKENS,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort },
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (message.stop_reason !== "end_turn") throw new Error(`A Claude-olvasó válasza nem teljes (stop_reason: ${message.stop_reason ?? "?"}).`);
  // A gondolkodás-blokk(ok) előbb jöhetnek — csak a szövegblokkok számítanak.
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
}

/** Spec S11/7: a B olvasó (claude-opus-5-5, medium) — ugyanaz az OCR-skill, mint az A-é. */
export function callClaudeOcr(file: ExtractorFile, model: string, effort: OcrEffort, client?: ClaudeMessagesClient): Promise<string> {
  const system = file.kind === "pdf" ? `${OCR_SYSTEM_PROMPT} Transcribe every PDF page and label its page number. Preserve formulas and units. Mark unreadable text explicitly.` : OCR_SYSTEM_PROMPT;
  return callClaudeVision(file, model, effort, system, null, client);
}

/** Olvasó a gyártó szerint: Anthropic-modell → `callClaudeOcr`, minden más → `callOcrModel` (effort-tal). */
export function callOcrReader(file: ExtractorFile, model: string, effort: OcrEffort): Promise<string> {
  return providerForModel(model) === "anthropic" ? callClaudeOcr(file, model, effort) : callOcrModel(file, model, effort);
}
