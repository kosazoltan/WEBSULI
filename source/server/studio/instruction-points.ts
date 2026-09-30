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

export const INSTRUCTION_POINTS_VERSION = "v1-inventory";
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

/** A független kivonatok uniójából a végleges, állapotolt jegyzék. */
export function buildInventory(passes: ReadonlyArray<ReadonlyArray<PointCandidate>>, request: string, sourceText: string | null | undefined, hash = inventoryHash(request, sourceText)): InstructionInventory {
  const frame = requestFrames(request);
  const all = passes.flat();
  const exclusions = all.filter((c) => c.kind === "exclude");
  const source = sourceText?.trim() ? normText(sourceText) : "";
  const excluded: string[] = [];
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
    const contradictory = texts.length > 1 && !texts.every((t) => texts.every((u) => t === u || t.includes(u) || u.includes(t)));
    const quoted = entry.candidates.find((c) => c.sourceQuote && alnum(normText(c.sourceQuote)).length >= 20 && source.includes(normText(c.sourceQuote)));
    const supports = quoted?.supports ?? (quoted ? "yes" : undefined);
    const base = { id, text: first.text, requestSpan: first.requestSpan, processing: "processed" as const };
    if (contradictory) return { ...base, content: "ambiguous" as const, reason: `két kivonat másképp értelmezi: ${texts.join(" / ").slice(0, 200)}` };
    if (!source) return { ...base, content: "undecidable" as const, reason: "nincs forrásszöveg, a pont nem igazolható" };
    if (quoted && supports === "yes") return { ...base, content: "pending" as const, sourceQuote: quoted.sourceQuote!, supports: "yes" as const, ...(quoted.reason ? { reason: quoted.reason } : {}) };
    if (quoted) return { ...base, content: "not_in_source" as const, sourceQuote: quoted.sourceQuote!, supports: "no" as const, reason: quoted.reason ?? "az idézet a témát érinti, az állítást nem igazolja" };
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
