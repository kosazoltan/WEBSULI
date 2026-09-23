import type { MapConcept } from "./coverage";
import { withSupportSkill } from "./support-skills";

/**
 * Spec 2026-09-23 — forrás-helyesbítés mint DOKUMENTÁLT kurálás.
 *
 * MÉRVE ÉLESBEN (map 2c43327f, kézírásos füzet fotója): az OCR a „kódex”-et „bódex”-nek, a
 * „Hold változása”-t „föld-változása”-nak olvasta. A #196 megalapozottság-kapu a térkép `term`
 * szavait követeli a blokkban, ezért a szerző kénytelen volt „bódex”-et tanítani; a javító körben
 * a helyes „Hold” olvasatot a lektor visszaküldte („a forrás szavára kell cserélni”).
 *
 * A modell csak JAVASOL; ez a modul determinisztikusan szűr, hogy a „helyesbítés” ne lehessen a
 * forrás saját tudásból való „okosítása”:
 *   - owner:         a tanár kérése kifejezetten tartalmazza az új szavakat;
 *   - transcription: fotó/kézírás-forrásnál betűszintű (≤ 2 szerkesztés/szó) olvasati hiba.
 * Az idézet (`quote`) SOHA nem változik: az marad a bizonyíték arra, mit olvasott az átíró.
 */
export type CorrectionBasis = "owner" | "transcription";
export type SourceCorrection = {
  localId: string;
  term?: string;
  definition?: string;
  basis: CorrectionBasis;
  reason: string;
  from: { term?: string; definition?: string };
};
export type CorrectionResult = { corrections: SourceCorrection[]; classroom?: number; rejected: string[]; warning?: string };

type RawCorrection = { localId?: unknown; term?: unknown; definition?: unknown; basis?: unknown; reason?: unknown };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const STEM = 5;
const stem = (w: string) => w.slice(0, STEM);

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Owner basis: every word the correction ADDS must be in the teacher's own request (stem level). */
export function ownerSupports(before: string, after: string, instruction: string): boolean {
  const old = new Set(words(before).map(stem));
  const asked = words(instruction);
  const added = words(after).filter((w) => w.length >= 3 && !old.has(stem(w)));
  if (added.length === 0) return false;
  // „holdváltozás” a kérésben egy összetett szó: a hozzáadott szó (tő vagy egész) a kérés egy szavának ELEJE.
  return added.every((w) => {
    const prefix = w.length <= STEM ? w : stem(w);
    return asked.some((a) => a.startsWith(prefix));
  });
}

/** Transcription basis: same word count; every changed pair is a ≤2-edit misread of a ≥4-letter word. */
export function isLetterLevelMisread(before: string, after: string): boolean {
  const a = words(before);
  const b = words(after);
  if (a.length === 0 || a.length !== b.length) return false;
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (Math.min(a[i].length, b[i].length) < 4 || levenshtein(a[i], b[i]) > 2) return false;
    changed++;
  }
  return changed > 0;
}

const ORDINALS = ["", "elso", "masodik", "harmadik", "negyedik", "otodik", "hatodik", "hetedik", "nyolcadik", "kilencedik", "tizedik", "tizenegyedik", "tizenkettedik"];

/**
 * The grade the teacher states in the request („ez 5. osztályos”, „ötödik osztály”, „7-es évfolyam”).
 * Deterministic: a negated mention („nem hetedik osztályos, hanem ötödik”) is skipped; the LAST
 * non-negated mention wins. undefined when the request names no grade.
 */
export function explicitClassroomOf(instruction: string | undefined): number | undefined {
  if (!instruction) return undefined;
  const text = fold(instruction);
  const found: Array<{ at: number; grade: number }> = [];
  for (const m of text.matchAll(/(?:^|[^0-9])(1[0-2]|[1-9])\s*\.?\s*(?:-?\s*(?:os|es|as|ik|s))?\s*(?:osztaly|evfolyam)/g)) {
    found.push({ at: m.index ?? 0, grade: Number(m[1]) });
  }
  ORDINALS.forEach((word, grade) => {
    if (!grade) return;
    for (const m of text.matchAll(new RegExp(`(?:^|[^a-z])${word}\\w*\\s+(?:osztaly|evfolyam)`, "g"))) found.push({ at: m.index ?? 0, grade });
  });
  const valid = found
    .filter((f) => !/(^|[^a-z])nem\s*$/.test(text.slice(Math.max(0, f.at - 12), f.at + 1)))
    .sort((a, b) => a.at - b.at);
  return valid.at(-1)?.grade;
}

/** Classroom from the model: accepted only when it equals the grade the teacher wrote. */
export function acceptedClassroom(raw: unknown, instruction: string | undefined): number | undefined {
  const asked = explicitClassroomOf(instruction);
  return asked !== undefined && raw === asked ? asked : undefined;
}

export function filterSourceCorrections(
  raw: unknown,
  concepts: MapConcept[],
  opts: { instruction?: string; transcript: boolean },
): CorrectionResult {
  const list = Array.isArray((raw as { corrections?: unknown })?.corrections) ? (raw as { corrections: RawCorrection[] }).corrections : [];
  const byId = new Map(concepts.map((c) => [c.localId, c]));
  const corrections: SourceCorrection[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const localId = typeof item?.localId === "string" ? item.localId : "";
    const concept = byId.get(localId);
    const basis = item?.basis === "owner" || item?.basis === "transcription" ? item.basis : null;
    if (!concept || !basis || seen.has(localId)) { rejected.push(`${localId || "?"}: ismeretlen fogalom, alap vagy ismétlés`); continue; }
    const check = (field: "term" | "definition"): string | undefined => {
      const next = typeof item[field] === "string" ? (item[field] as string).trim() : "";
      const before = concept[field] ?? "";
      if (!next || next === before) return undefined;
      const ok = basis === "owner"
        ? !!opts.instruction && (ownerSupports(before, next, opts.instruction) || (opts.transcript && isLetterLevelMisread(before, next)))
        : opts.transcript && isLetterLevelMisread(before, next);
      if (!ok) { rejected.push(`${localId}.${field}: „${before}” → „${next}” nem igazolt (${basis})`); return undefined; }
      return next;
    };
    const term = check("term");
    const definition = check("definition");
    if (term === undefined && definition === undefined) continue;
    seen.add(localId);
    corrections.push({
      localId, basis, reason: typeof item.reason === "string" ? item.reason.slice(0, 300) : "",
      ...(term !== undefined ? { term } : {}), ...(definition !== undefined ? { definition } : {}),
      from: { ...(term !== undefined ? { term: concept.term } : {}), ...(definition !== undefined ? { definition: concept.definition } : {}) },
    });
  }
  const classroom = acceptedClassroom((raw as { classroom?: unknown })?.classroom, opts.instruction);
  return { corrections, ...(classroom !== undefined ? { classroom } : {}), rejected };
}

/** The quote is evidence of what was transcribed: it never changes. */
export function applySourceCorrections<T extends MapConcept>(concepts: T[], corrections: SourceCorrection[]): T[] {
  const byId = new Map(corrections.map((c) => [c.localId, c]));
  return concepts.map((c) => {
    const fix = byId.get(c.localId);
    return fix ? { ...c, ...(fix.term !== undefined ? { term: fix.term } : {}), ...(fix.definition !== undefined ? { definition: fix.definition } : {}) } : c;
  });
}

/**
 * The km_concepts.verbatim_reason column is varchar(32) — a reason CODE, not prose (measured 2026-09-23:
 * writing the audit text there failed the apply transaction with "value too long for type character
 * varying(32)"). The full old → new audit lives in the repair candidate / job output.
 */
export const CORRECTION_REASON_MAX = 32;
export function correctionReasonCode(fix: Pick<SourceCorrection, "basis">): string {
  return `corrected:${fix.basis}`;
}

export function correctionAuditText(fix: SourceCorrection): string {
  const label = fix.basis === "owner" ? "tanár" : "átírás";
  const parts = [fix.term !== undefined ? `„${fix.from.term}” → „${fix.term}”` : "", fix.definition !== undefined ? `definíció: „${fix.from.definition}” → „${fix.definition}”` : ""].filter(Boolean);
  return `helyesbítés (${label}): ${parts.join("; ")}`.slice(0, 1000);
}

/** Prompt lines for author/lektor: the documented curation list. */
export function correctionPromptLines(corrections: SourceCorrection[] | undefined): string[] {
  if (!corrections?.length) return [];
  return [
    "FORRÁS-HELYESBÍTÉSEK (dokumentált kurálás — a térkép term/definition mezője MÁR a helyesbített alakot tartalmazza; a quote az eredeti átirat, bizonyítékként változatlan):",
    ...corrections.map((c) => `- ${c.localId} [${c.basis === "owner" ? "tanári kérés" : "átírási hiba"}]: ${correctionAuditText(c)}`),
    "Ha a lecke a helyesbített alakot tanítja, az NEM ellentmondás a forrással; a quote eltérő betűalakját ne kérd vissza.",
    "",
  ];
}

export function buildCorrectionPrompt(concepts: MapConcept[], instruction: string | undefined, transcript: boolean): string {
  return withSupportSkill("corrector", [
    "Te a forrás-helyesbítő vagy: a kurált fogalomtérkép SZÓALAKJAIT ellenőrzöd. Nem tanítasz, nem bővítesz, nem fogalmazol át.",
    "Két esetben javasolhatsz helyesbítést a term és/vagy definition mezőre:",
    "1. basis=\"owner\": a tanár kérése KIFEJEZETTEN megnevez egy hibás szót/állítást és a helyeset (pl. „nem bódex, hanem kódex”). Csak azt írod át, amit a kérés megnevez, a kérés szavaival.",
    transcript
      ? "2. basis=\"transcription\": a forrás fénykép/kézírás átirata; egy szó nyilvánvaló betűszintű félreolvasás (nem létező magyar szó vagy a mondatban értelmetlen), és egy 1–2 betűben eltérő, a szövegkörnyezetben egyértelmű szó a helyes (pl. „bézzel írt” → „kézzel írt”). Szót nem teszel hozzá és nem hagysz el; ha nem egyértelmű, NEM javasolsz."
      : "2. basis=\"transcription\" ennél a forrásnál NEM megengedett (nem fotó/kézírás átirata).",
    "Évfolyam: csak ha a tanár kérése kifejezetten megad egy évfolyamot, add vissza a \"classroom\" mezőben számként.",
    "Tilos: saját tudásból tényt, számot, dátumot javítani; stílust javítani; a quote mezőt módosítani; nem kért fogalmat érinteni.",
    "A válasz CSAK JSON: { \"corrections\": [{ \"localId\": string, \"term\"?: string, \"definition\"?: string, \"basis\": \"owner\"|\"transcription\", \"reason\": string }], \"classroom\"?: number }. Ha nincs mit helyesbíteni: { \"corrections\": [] }.",
    "",
    ...(instruction ? ["A tanár kérése (adat):", "<<<", instruction, ">>>", ""] : ["A tanár nem adott kérést.", ""]),
    "Fogalomtérkép:",
    JSON.stringify(concepts.map((c) => ({ localId: c.localId, term: c.term, definition: c.definition, quote: c.quote }))),
  ].join("\n"));
}

/** One model call + deterministic filter. Never throws: a failed proposal means no correction. */
export async function proposeSourceCorrections(
  call: (system: string, user: string) => Promise<unknown>,
  concepts: MapConcept[],
  opts: { instruction?: string; transcript: boolean },
): Promise<CorrectionResult> {
  if (!opts.instruction && !opts.transcript) return { corrections: [], rejected: [] };
  try {
    const raw = await call(buildCorrectionPrompt(concepts, opts.instruction, opts.transcript), "Válaszolj kizárólag a kért JSON-nal.");
    return filterSourceCorrections(raw, concepts, opts);
  } catch (error) {
    return { corrections: [], rejected: [], warning: `A forrás-helyesbítés kimaradt: ${error instanceof Error ? error.message : String(error)}` };
  }
}
