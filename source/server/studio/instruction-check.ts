import { createHash } from "node:crypto";
import type { Lesson } from "../../shared/lesson-schema";
import type { MapConcept } from "./coverage";
import { withSupportSkill } from "./support-skills";
import { teachablePoints, type InstructionInventory } from "./instruction-points";

/**
 * Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés pontjainak mérése a kész leckén.
 *
 * A kérés eddig csak prompt-bemenet volt (a kész leckén semmi nem mérte). Élő eset (Mezopotámia): a kért „Babilon városa
 * Kr. e. 2500 körül” pont csak „szerepel a füzetben” alakban jelent meg. A modell pontonként dönt, de a „tanítja”
 * döntés csak a lecke szövegéből betűhíven kimásolt bizonyítékkal fogadható el (hallucináció-őr).
 */

export const INSTRUCTION_CHECK_MODEL = "claude-opus-5-5";

export type InstructionPoint = { point: string; taught: boolean; evidence: string; section: number | null; sourceQuote?: string; /** U3: a pontjegyzék azonosítója. */ id?: string; /** U3: az ellenőrző nem jelentette (részleges jelentés). */ undecidable?: boolean };
export type InstructionCheck = { hash: string; points: InstructionPoint[]; /** U3 (§C-V/6): teljes = minden jegyzék-azonosítóról van ítélet. */ complete?: boolean; missingIds?: string[]; /** Spec 2026-10-01-gyokerok-egyben (2.2b): a részleges jelentés egyszer újrakérve. */ retried?: boolean; };

/**
 * A lecke tanítása fejezetenként (cím, explain, példa, összefoglaló) — ebben keressük a „tanítja” bizonyítékát. A modell
 * mellette opcionálisan a forrásszöveget is kapja; a hiányzó pont `sourceQuote`-ját a `parseInstructionCheck` külön, a
 * forrásban ellenőrzi.
 */
export function teachingText(lesson: Lesson): string {
  return lesson.sections.map((section, i) => {
    const parts = section.blocks.flatMap((b) => {
      if (b.kind === "explain") return [b.text];
      if (b.kind === "example") return [b.problem, ...b.steps, b.answer];
      if (b.kind === "recap") return b.bullets;
      return [];
    });
    return `[${i}] ${section.heading}\n${parts.join("\n")}`;
  }).join("\n\n");
}

/** A fejezet TÖRZSSZÖVEGE (cím nélkül): a „tanítja” bizonyítéka csak ebből fogadható el (U3/H34: a cím nem bizonyíték). */
export function sectionBodyText(lesson: Lesson, index: number): string {
  const section = lesson.sections[index];
  if (!section) return "";
  return section.blocks.flatMap((b) => {
    if (b.kind === "explain") return [b.text];
    if (b.kind === "example") return [b.problem, ...b.steps, b.answer];
    if (b.kind === "recap") return b.bullets;
    return [];
  }).join("\n");
}

/**
 * Review #155 (P2): a kulcs a forrást és a mérés sémaverzióját is tartalmazza (a forrás befolyásolja az eredményt).
 * U3: ellenőrzés-kulcs (B0 `verificationKey`) — a pontjegyzék hash-e is része, ha van.
 */
export const INSTRUCTION_CHECK_VERSION = "v3-inventory";
export function instructionCheckHash(instruction: string, lesson: Lesson, sourceText?: string | null, inventoryHash?: string): string {
  return createHash("sha256").update(`${INSTRUCTION_CHECK_VERSION}\n${instruction}\n---\n${teachingText(lesson)}\n---\n${sourceText ?? ""}\n---\n${inventoryHash ?? ""}`).digest("hex");
}

export function buildInstructionCheckPrompt(instruction: string, lesson: Lesson, sourceText?: string | null, inventory?: InstructionInventory): { system: string; user: string } {
  const points = inventory ? teachablePoints(inventory).map((p) => ({ id: p.id, text: p.text })) : undefined;
  return {
    system: withSupportSkill("instruction-checker", "Mérd a tanár kérését a lecke tanításához a skill szerint. Kizárólag a kért JSON-t add vissza."),
    user: JSON.stringify({ title: lesson.title, classroom: lesson.classroom, instruction,
      ...(points ? { points, note: "Minden points-azonosítóról pontosan egy ítélet; új pont nem vehető fel." } : { note: "Nincs pontjegyzék: a points elemek point mezővel (a kérés tartalmi pontja), id nélkül." }),
      lesson: teachingText(lesson), ...(sourceText?.trim() ? { source: sourceText.slice(0, 60_000) } : {}) }),
  };
}

const alnumLength = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").length;
export type InventoryCheck = { points: InstructionPoint[]; complete: boolean; missingIds: string[] };
/**
 * U3 (C14 4. pont, §C-V/6): a jegyzék azonosítóihoz mért ítélet. A bizonyíték csak a MEGNEVEZETT fejezet törzsszövegéből
 * (cím kizárva) fogadható el; üres lista kérés-pontok mellett hiba (H34); a nem jelentett azonosító `undecidable`, a
 * jelentés részleges (`complete: false`) — részleges jelentés soha nem teljes igazolás.
 */
export function parseInventoryCheck(json: unknown, lesson: Lesson, sourceText: string | null | undefined, inventory: InstructionInventory): InventoryCheck {
  const raw = (json as { points?: unknown } | null)?.points;
  if (!Array.isArray(raw)) throw new Error("a tanári kérés mérése nem a kért alakú JSON");
  const expected = teachablePoints(inventory);
  if (expected.length && raw.length === 0) throw new Error(`a tanári kérés mérése üres pontlistát adott, pedig a jegyzékben ${expected.length} igazolt pont van`);
  const source = sourceText ? norm(sourceText) : "";
  const byId = new Map(expected.map((p) => [p.id, p]));
  const reported = new Map<string, InstructionPoint>();
  for (const item of raw) {
    const p = item as { id?: unknown; taught?: unknown; evidence?: unknown; section?: unknown; sourceQuote?: unknown };
    if (typeof p?.id !== "string" || !byId.has(p.id) || reported.has(p.id)) continue;
    const point = byId.get(p.id)!;
    const section = Number.isInteger(p.section) && (p.section as number) >= 0 && (p.section as number) < lesson.sections.length ? p.section as number : null;
    const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
    const normalized = norm(evidence);
    const proven = p.taught === true && section !== null && alnumLength(normalized) >= 8 && norm(sectionBodyText(lesson, section)).includes(normalized);
    const quote = typeof p.sourceQuote === "string" ? p.sourceQuote.trim().slice(0, 300) : "";
    const quoted = !proven && source && alnumLength(norm(quote)) >= 20 && source.includes(norm(quote));
    reported.set(p.id, { id: p.id, point: point.text, taught: proven, evidence: proven ? evidence : "", section, ...(quoted ? { sourceQuote: quote } : point.sourceQuote && !proven ? { sourceQuote: point.sourceQuote } : {}) });
  }
  const missingIds = expected.filter((p) => !reported.has(p.id)).map((p) => p.id);
  const points = [...expected.map((p) => reported.get(p.id) ?? { id: p.id, point: p.text, taught: false, evidence: "", section: null, undecidable: true, ...(p.sourceQuote ? { sourceQuote: p.sourceQuote } : {}) })];
  return { points, complete: missingIds.length === 0, missingIds };
}

const norm = (s: string) => s.toLocaleLowerCase("hu").replace(/\*\*/g, "").replace(/[„”"'’]/g, "").replace(/\s+/g, " ").trim();

/** A modell válasza pontokká; a bizonyíték nélküli (vagy nem betűhív) „tanítja” hiánynak számít. */
export function parseInstructionCheck(json: unknown, lesson: Lesson, sourceText?: string | null): InstructionPoint[] {
  const raw = (json as { points?: unknown } | null)?.points;
  if (!Array.isArray(raw)) throw new Error("a tanári kérés mérése nem a kért alakú JSON");
  const haystack = norm(teachingText(lesson));
  const source = sourceText ? norm(sourceText) : "";
  return raw.flatMap((item) => {
    const p = item as { point?: unknown; taught?: unknown; evidence?: unknown; section?: unknown; sourceQuote?: unknown };
    if (typeof p?.point !== "string" || !p.point.trim()) return [];
    const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
    // Review #152: a hossz a NORMALIZÁLT bizonyítékon mérve (a „********” normalizálva üres, az includes("") mindig igaz).
    const normalized = norm(evidence);
    const proven = p.taught === true && normalized.replace(/[^\p{L}\p{N}]/gu, "").length >= 8 && haystack.includes(normalized);
    const section = Number.isInteger(p.section) && (p.section as number) >= 0 && (p.section as number) < lesson.sections.length ? p.section as number : null;
    // Spec 2026-09-30-tanari-keres-forrasbol: a hiányzó pont forrás-idézete csak betűhíven (normalizálva) elfogadható.
    // Review #155: a dokumentált 300 karakteres korlát a programban is (ellenőrzés és tárolás ugyanazon a szeleten).
    const quote = typeof p.sourceQuote === "string" ? p.sourceQuote.trim().slice(0, 300) : "";
    const quoted = !proven && source && norm(quote).replace(/[^\p{L}\p{N}]/gu, "").length >= 20 && source.includes(norm(quote));
    return [{ point: p.point.trim().slice(0, 300), taught: proven, evidence: proven ? evidence : "", section, ...(quoted ? { sourceQuote: quote } : {}) }];
  });
}

/**
 * Spec 2026-09-30-tanari-keres-forrasbol (élő mérés: Egyiptom, 22 pontból 5 hiányzott, pedig a forrásban benne volt): a szerző
 * csak a tudástár fogalmaiból tanít, a kivonatolás viszont ezekre a pontokra nem készített fogalmat. A forrásból betűhíven
 * igazolt hiányzó pont kiegészítő fogalom lesz a job (fókuszált) tudástárában — a „forrás a mérce” szabály így sem sérül.
 */
export const instructionConceptId = (point: string) => `instr-${createHash("sha1").update(point).digest("hex").slice(0, 8)}`;
export function instructionConceptsFrom(points: InstructionPoint[]): MapConcept[] {
  return points.filter((p) => !p.taught && p.sourceQuote).map((p) => ({
    localId: instructionConceptId(p.point),
    term: p.point.slice(0, 80),
    definition: p.point,
    quote: p.sourceQuote,
    examWeight: "supporting" as const,
  } as MapConcept));
}

export const missingPoints = (points: InstructionPoint[]) => points.filter((p) => !p.taught);
