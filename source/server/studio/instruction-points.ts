import { createHash } from "node:crypto";
import { OWNER_INSTRUCTION_FRAME, type OwnerInventory } from "../../shared/owner-instruction";
import type { MapConcept } from "./coverage";
import { instructionConceptId } from "./instruction-check";
import { withSupportSkill } from "./support-skills";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U3, C14): a tanár kérésének PONTJEGYZÉKE — EGYSZER, a tervezés ELŐTT.
 *
 * Mért ok (H7, Egyiptom 5ca6ab42/d76548dd: 22 ill. 16 pontból 5–7 tanítatlan): a kérés csak prompt-bemenet volt, senki
 * nem kapta pontlistaként; a kész leckén mért hiányra késői, drága javító kör ment. H34: a hiányzó pont forrás-idézete a
 * TÉMÁT érintette, nem az állítást igazolta („szabad parasztok dolgoznak a földeken” a társadalom csoportjaihoz).
 *
 * A jegyzék determinisztikus szabályai (a modell javasol, a program dönt):
 * - két FÜGGETLEN kivonat uniója a jelöltlista (teljesség);
 * - végleges pont csak `requestSpan` visszakötéssel (a kérés betűhű részlete) — enélkül a jelölt kiesik;
 * - a tanár által kizárt tartalom (`exclude`) kiesik; azonos span eltérő értelmezéssel → `ambiguous`;
 * - „a forrás alátámasztja” külön ellenőrzés: betűhű idézet ÉS `supports: yes`; különben `not_in_source`;
 *   forrásszöveg nélkül `undecidable` (ok megnevezve);
 * - a keretbe (`OWNER_INSTRUCTION_FRAME`) nem férő rész `unprocessed` pontként JELÖLT, nem elhallgatott (H47/H50).
 */

// Review #167: a többértelműség és az idézet-igazolás szemantikája változott — a mentett jegyzékek újraszámolódnak.
export const INSTRUCTION_POINTS_VERSION = "v2-inventory";
export const INSTRUCTION_POINTS_MODEL = "claude-opus-5-5";

export type PointState = "pending" | "taught" | "source_available_missing" | "not_in_source" | "undecidable" | "ambiguous";
export type InventoryPoint = {
  id: string;
  text: string;
  /** A kérés betűhű részlete, amelyből a pont származik (a visszakötés). */
  requestSpan: string;
  processing: "processed" | "unprocessed";
  content: PointState;
  sourceQuote?: string;
  supports?: "yes" | "no";
  reason?: string;
};
export type InstructionInventory = {
  version: string;
  hash: string;
  truncated: boolean;
  /** A tanár által kizárt (és ezért kiesett) jelöltek szövege — átláthatóság, nem tanítandó. */
  excluded: string[];
  points: InventoryPoint[];
};
export type PointCandidate = { text: string; requestSpan: string; kind: "teach" | "exclude" | "style"; sourceQuote?: string; supports?: "yes" | "no"; reason?: string };

export const normText = (s: string) => s.toLocaleLowerCase("hu").replace(/\*\*/g, "").replace(/[„”"'’]/g, "").replace(/\s+/g, " ").trim();
const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
export const pointId = (requestSpan: string) => `pt-${createHash("sha1").update(normText(requestSpan)).digest("hex").slice(0, 8)}`;

/** A feldolgozott keret és a maradék: a maradék nem vész el, hanem külön pontként jelölt. */
export function requestFrames(request: string): { processed: string; rest: string; truncated: boolean } {
  const processed = request.slice(0, OWNER_INSTRUCTION_FRAME), rest = request.slice(OWNER_INSTRUCTION_FRAME);
  return { processed, rest, truncated: rest.length > 0 };
}

export function inventoryHash(request: string, sourceText?: string | null): string {
  return createHash("sha256").update(`${INSTRUCTION_POINTS_VERSION}\n${request}\n---\n${sourceText ?? ""}`).digest("hex");
}

export function buildInstructionPointsPrompt(request: string, sourceText: string | null | undefined, meta: { title: string; subject: string; classroom: number }, pass: 1 | 2): { system: string; user: string } {
  const frame = requestFrames(request);
  return {
    system: withSupportSkill("instruction-points", `Készítsd el a tanár kérésének pontjegyzékét a skill szerint (${pass}. független kivonat; a másik kivonatot nem látod). Kizárólag a kért JSON-t add vissza.`),
    user: JSON.stringify({ title: meta.title, subject: meta.subject, classroom: meta.classroom, pass, request: frame.processed,
      ...(frame.truncated ? { requestTruncated: `a kérés további ${frame.rest.length} karaktere nincs ebben a keretben` } : {}),
      ...(sourceText?.trim() ? { source: sourceText.slice(0, 60_000) } : {}) }),
  };
}

/** A modell jelöltjei; a `requestSpan` nélküli vagy nem betűhű jelölt kiesik (a program nem találgat). */
export function parseInstructionPointCandidates(json: unknown, request: string): PointCandidate[] {
  const raw = (json as { points?: unknown } | null)?.points;
  if (!Array.isArray(raw)) throw new Error("a pontjegyzék-kivonat nem a kért alakú JSON");
  const haystack = normText(requestFrames(request).processed);
  const out: PointCandidate[] = [];
  for (const item of raw) {
    const p = item as { text?: unknown; requestSpan?: unknown; kind?: unknown; sourceQuote?: unknown; supports?: unknown; reason?: unknown };
    if (typeof p?.text !== "string" || !p.text.trim() || typeof p.requestSpan !== "string") continue;
    const span = p.requestSpan.trim();
    if (alnum(span).length < 3 || !haystack.includes(normText(span))) continue;
    const kind = p.kind === "exclude" || p.kind === "style" ? p.kind : "teach";
    const quote = typeof p.sourceQuote === "string" ? p.sourceQuote.trim().slice(0, 300) : "";
    out.push({ text: p.text.trim().slice(0, 200), requestSpan: span.slice(0, 400), kind,
      ...(quote ? { sourceQuote: quote } : {}), ...(p.supports === "yes" || p.supports === "no" ? { supports: p.supports } : {}),
      ...(typeof p.reason === "string" && p.reason.trim() ? { reason: p.reason.trim().slice(0, 300) } : {}) });
  }
  return out;
}

const overlaps = (a: string, b: string) => { const x = normText(a), y = normText(b); return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x)); };

/**
 * Élő mérés (Egyiptom r3, job ba8e35bb, 2026-10-01): 27 pontból 14 lett `ambiguous`, mert a két kivonat ugyanarra a
 * kérésrészletre csak MÁS SZAVAKKAL írt pontot („A papok a társadalom egyik csoportja.” / „a társadalom csoportja:
 * papok”). A terv (§U3) az EGYMÁSNAK ELLENTMONDÓ értelmezést jelöli többértelműnek, nem az átfogalmazást. Determinisztikus
 * mérce: a jelölt akkor értelmezi ugyanazt a kérésrészletet, ha a szövege a részlet tartalmáról szól (közös, ékezet
 * nélküli szótő); ha valamelyik eltérő szövegű jelölt nem kötődik a részlethez („a piramisokat” → „A sírépítés
 * technikája”), az átértelmezés → `ambiguous`.
 */
const foldHu = (s: string) => normText(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// Review #167: a 3 betűs rövidítés (DNS, ENSZ-alak) is szótő; a gyakori 3 betűs kötőszavak nem.
const SHORT_STOP = new Set(["egy", "meg", "nem", "van", "sem", "fel", "mar", "ami", "aki", "ott", "itt", "ezt", "azt", "kis"]);
const words = (s: string) => foldHu(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const stems = (s: string) => words(s).filter((w) => w.length >= 4 || (w.length === 3 && !SHORT_STOP.has(w))).map((w) => w.slice(0, 5));
const wordHit = (st: string, text: string) => st.length >= 4 ? text.includes(st) : words(text).includes(st);
function anchoredToSpan(text: string, span: string): boolean {
  const t = foldHu(text), r = foldHu(span);
  return stems(text).some((st) => wordHit(st, r)) || stems(span).some((st) => wordHit(st, t));
}
/** Közös szótő két jelölt szövege között (a részlethez nem kötődő, de a kötött jelölttel azonos tartalmú átfogalmazás). */
const sharesStem = (a: string, b: string) => { const fb = foldHu(b); return stems(a).some((st) => wordHit(st, fb)); };
/** Review #167 (P1): az ellentétes állítás (tagadás) közös témaszó mellett is ellentmondó értelmezés. */
const NEGATION = new Set(["nem", "sem", "soha", "sehol", "nincs", "nincsen", "sincs", "se", "ne"]);
const negated = (s: string) => words(s).some((w) => NEGATION.has(w));

/**
 * Betűhű idézet a forrásból. Élő mérés (ba8e35bb): a „papiruszra írtak” felsorolás-tétel (16 betű) a 20 betűs alsó határ
 * miatt nem igazolt — a rövid idézet akkor is igazol, ha egy TELJES forrássor / felsorolás-tétel betűhű másolata.
 */
/** Egy forrássor / idézet összevethető alakja: felsorolásjel és záró írásjel nélkül (review #167: a „papiruszra írtak.” is). */
export const lineKey = (s: string) => normText(s.replace(/^\s*[-•*–]\s*/, "")).replace(/[.;:,!?]+$/, "").trim();
function verbatimInSource(quote: string, source: string, sourceLines: ReadonlySet<string>): boolean {
  const q = normText(quote);
  if (!source.includes(q)) return false;
  const key = lineKey(quote);
  return alnum(q).length >= 20 || (alnum(key).length >= 8 && sourceLines.has(key));
}

/** A független kivonatok uniójából a végleges, állapotolt jegyzék. */
export function buildInventory(passes: ReadonlyArray<ReadonlyArray<PointCandidate>>, request: string, sourceText: string | null | undefined, hash = inventoryHash(request, sourceText)): InstructionInventory {
  const frame = requestFrames(request);
  const all = passes.flat();
  const exclusions = all.filter((c) => c.kind === "exclude");
  const source = sourceText?.trim() ? normText(sourceText) : "";
  const sourceLines = new Set((sourceText ?? "").split(/\r?\n/).map(lineKey).filter(Boolean));
  // Review #161 (Sourcery): a tanár kizárása akkor is a jegyzék része (átláthatóság), ha nincs vele átfedő tanítandó jelölt.
  const excluded: string[] = exclusions.map((e) => e.text).filter((t, i, arr) => arr.indexOf(t) === i);
  const byId = new Map<string, { texts: Set<string>; candidates: PointCandidate[] }>();
  const seenText = new Set<string>();
  for (const c of all) {
    if (c.kind !== "teach") continue;
    if (exclusions.some((e) => overlaps(e.text, c.text) || overlaps(e.requestSpan, c.requestSpan) || overlaps(e.text, c.requestSpan))) { if (!excluded.includes(c.text)) excluded.push(c.text); continue; }
    const id = pointId(c.requestSpan);
    const entry = byId.get(id);
    if (entry) { entry.texts.add(normText(c.text)); entry.candidates.push(c); continue; }
    if (seenText.has(normText(c.text))) continue; // ugyanaz a pont másik spanből — nem két pont
    seenText.add(normText(c.text));
    byId.set(id, { texts: new Set([normText(c.text)]), candidates: [c] });
  }
  const haystack = normText(frame.processed);
  const points: InventoryPoint[] = [...byId.entries()].map(([id, entry]) => {
    const first = entry.candidates[0];
    const texts = [...entry.texts];
    const reworded = texts.length > 1 && !texts.every((t) => texts.every((u) => t === u || t.includes(u) || u.includes(t)));
    // Ellentmondó értelmezés: (a) eltérő polaritás (tagadás); (b) eltérő szövegű jelölt, amely sem a részlethez, sem egy
    // részlethez kötött jelölt szövegéhez nem kötődik (közös szótő).
    const anchored = entry.candidates.filter((c) => anchoredToSpan(c.text, c.requestSpan));
    const polarity = new Set(entry.candidates.map((c) => negated(c.text)));
    const contradictory = polarity.size > 1 || (reworded && entry.candidates.some((c) => !anchored.includes(c) && !anchored.some((a) => sharesStem(c.text, a.text))));
    // Review #161 (Codex P1 / Sourcery): csak a KIMONDOTT `supports: "yes"` igazol — a betűhű idézet önmagában a témát
    // érintheti (H34); a hiányzó ítélet ellenőrző-hiba → eldöntetlen, nem igazolt.
    const verifiedQuotes = entry.candidates.filter((c) => c.sourceQuote && verbatimInSource(c.sourceQuote, source, sourceLines));
    const quoted = verifiedQuotes.find((c) => c.supports === "yes") ?? verifiedQuotes.find((c) => c.supports === "no") ?? verifiedQuotes[0];
    // A tanítandó szöveg az IGAZOLT értelmezés megfogalmazása (ha van ilyen), különben az első jelölté.
    const shown = quoted && quoted.supports === "yes" ? quoted : first;
    const base = { id, text: shown.text, requestSpan: first.requestSpan, processing: "processed" as const };
    if (contradictory) return { ...base, content: "ambiguous" as const, reason: `két kivonat másképp értelmezi: ${texts.join(" / ").slice(0, 200)}` };
    if (!source) return { ...base, content: "undecidable" as const, reason: "nincs forrásszöveg, a pont nem igazolható" };
    if (quoted && quoted.supports === "yes") return { ...base, content: "pending" as const, sourceQuote: quoted.sourceQuote!, supports: "yes" as const, ...(quoted.reason ? { reason: quoted.reason } : {}) };
    if (quoted && quoted.supports === "no") return { ...base, content: "not_in_source" as const, sourceQuote: quoted.sourceQuote!, supports: "no" as const, reason: quoted.reason ?? "az idézet a témát érinti, az állítást nem igazolja" };
    if (quoted) return { ...base, content: "undecidable" as const, sourceQuote: quoted.sourceQuote!, reason: "a kivonatoló nem adott alátámasztási ítéletet (supports) az idézethez" };
    // A modell „a forrás kimondja” indoka nem jelenhet meg ellenőrizhetetlen idézet mellett (mért: félrevezető hiány-ok).
    const claimed = entry.candidates.find((c) => c.supports === "yes" && c.sourceQuote);
    if (claimed) return { ...base, content: "not_in_source" as const, reason: `a forrás-idézet nem igazolható betűhűen: „${claimed.sourceQuote!.slice(0, 120)}”` };
    return { ...base, content: "not_in_source" as const, reason: first.reason ?? "nincs betűhű forrás-idézet" };
  }).sort((a, b) => haystack.indexOf(normText(a.requestSpan)) - haystack.indexOf(normText(b.requestSpan)));
  if (frame.truncated) points.push({ id: "pt-unprocessed", text: `A kérés feldolgozatlan része (${frame.rest.length} karakter a ${OWNER_INSTRUCTION_FRAME} karakteres kereten túl)`, requestSpan: frame.rest.slice(0, 160), processing: "unprocessed", content: "undecidable", reason: "kereten túl, nem feldolgozott" });
  return { version: INSTRUCTION_POINTS_VERSION, hash, truncated: frame.truncated, excluded, points };
}

/** A tanítandó (igazolt) pontok — a tervező fejezethez rendeli, a szerző kimondja, a kapu azonosítónként méri. */
export const teachablePoints = (inventory: InstructionInventory): InventoryPoint[] =>
  inventory.points.filter((p) => p.processing === "processed" && (p.content === "pending" || p.content === "taught" || p.content === "source_available_missing"));

/** A tanárnak jelzett hiányok: nem tanítandó pontok az okkal (`job.output.gaps`, `lesson.gaps`, panel). */
export const gapPoints = (inventory: InstructionInventory): Array<{ id: string; point: string; reason: string }> =>
  inventory.points.filter((p) => p.processing === "unprocessed" || p.content === "not_in_source" || p.content === "undecidable" || p.content === "ambiguous")
    .map((p) => ({ id: p.id, point: p.text, reason: p.reason ?? (p.content === "not_in_source" ? "nincs a forrásban" : p.content) }));

/**
 * Az igazolt pont kiegészítő fogalom lesz a job tudástárában (spec 2026-09-30-tanari-keres-forrasbol elve, de már a
 * tervezés előtt): a szerző csak a tudástárból tanít, ezért az idézettel igazolt pont fogalomként jelenik meg.
 */
export function inventoryConcepts(inventory: InstructionInventory): MapConcept[] {
  return teachablePoints(inventory).filter((p) => p.sourceQuote).map((p) => ({
    localId: instructionConceptId(p.text), term: p.text.slice(0, 80), definition: p.text, quote: p.sourceQuote, examWeight: "supporting" as const,
  } as MapConcept));
}

/** A promptblokk szolgáltatófüggetlen alakja. */
export const ownerInventoryOf = (inventory: InstructionInventory): OwnerInventory => ({
  truncated: inventory.truncated,
  points: inventory.points.map((p) => ({ id: p.id, text: p.text, content: p.content, processing: p.processing, ...(p.sourceQuote ? { sourceQuote: p.sourceQuote } : {}), ...(p.reason ? { reason: p.reason } : {}) })),
});
