import { createHash } from "node:crypto";
import { SKILL_RULES, type SkillCode } from "../../shared/lesson-skill";
import type { WorkflowView } from "../../shared/lesson-workflow";
import { redactSecrets } from "../workflows/orchestrator";

/**
 * Spec 2026-10-06-s5-tantargyi-memoria: a tantárgyi memória TISZTA magja (DB és modell nélkül). Kártya = egy tantárgy visszatérő
 * hibaosztálya egy lépésen; a képzés determinisztikus (workflow-lelet, lektori blokkoló jegyzet, orkesztrátor-kimenet). A promptba
 * KIZÁRÓLAG karbantartott szabályszöveg kerül (shared/lesson-skill.ts elve: hiba-/forrásszöveg soha) — a javító összefoglaló csak
 * tárolódik és az adminnak látszik.
 */
export function subjectMemoryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STUDIO_SUBJECT_MEMORY === "1";
}

export const MEMORY_LIMITS = { promptCards: 6, promptChars: 1500, snapshotCards: 40, evidenceRefs: 10, summaryChars: 300, decayDays: 45, openAt: 2 } as const;
const DAY_MS = 86_400_000;

export type MemoryRole = "pedagogue" | "author" | "bank";
export type MemoryStatus = "open" | "watch" | "closed";
export type MemoryEvidence = { subject: string; step: string; code: string; key: string; at: number; summary?: string };
export type MemoryCard = {
  fingerprint: string; subject: string; step: string; code: string; occurrences: number; firstSeen: number; lastSeen: number;
  status: MemoryStatus; evidence: string[]; correctiveSummary: string | null; correctiveAt: number | null; correctiveCount: number;
};
export type MemorySnapshot = { version: 1; subject: string; at: number; cards: MemoryCard[] };

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const cardFingerprint = (subject: string, step: string, code: string) => sha(`s5:1|${subject}|${step}|${code}`).slice(0, 32);
const safeToken = (text: unknown, fallback: string) => (typeof text === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(text) ? text : fallback);

/* ---------- Karbantartott kódkatalógus ---------- */
type CodeEntry = { title: string; rule: string; roles: readonly MemoryRole[] | "byStep" };
const BANK: readonly MemoryRole[] = ["bank"];
const SKILL_ROLES: Record<SkillCode, readonly MemoryRole[]> = {
  prompt_injection: ["pedagogue", "author", "bank"], schema: ["pedagogue", "author", "bank"],
  concept_reference: ["author", "bank"], source_fidelity: ["author", "bank"],
  bank_cardinality: BANK, sample_score: BANK, duplicate_question: BANK, oral_written: BANK, repair_scope: BANK,
  coverage: ["pedagogue", "author"], teaching_depth: ["pedagogue", "author"], typography: ["author"],
  review_evidence: [], html_complete: [], citations: [],
};
const OWN_CODES: Record<string, CodeEntry> = {
  lektor_source_conflict: { title: "Lektori forrásellentmondás", roles: "byStep",
    rule: "A lektor ebben a tantárgyban gyakran talált a tanítással vagy a forrással ellentétes állítást. Minden tényt, megnevezést, számot és a helyes választ vesd össze a fejezet tanításával; a megnevezéseket a tanításból pontosan vedd át, új tényt ne írj." },
  lektor_not_in_map: { title: "Tanítatlan tartalom", roles: "byStep",
    rule: "A lektor gyakran talált a térképen és a tanításban nem szereplő tartalmat. Csak a megadott fogalmakra és a ténylegesen tanított tudásra építs." },
  lektor_concept_binding: { title: "Hiányzó fogalomkötés", roles: "byStep",
    rule: "A lektor gyakran talált fogalomkötés nélküli tételt. Minden tételhez add meg az engedélyezett listából, mely fogalmat ellenőrzi." },
  lektor_coverage_gap: { title: "Fedetlen kötelező fogalom", roles: ["pedagogue", "author"],
    rule: "A lektor gyakran jelezte, hogy egy kötelező fogalom tanítása hiányzik. Minden kötelező fogalmat tervezz be, magyarázz el és mutass be kidolgozott példán." },
  fail_gate: { title: "Kapu-visszadobás", roles: "byStep",
    rule: "A kötelező ellenőrzés ebben a tantárgyban gyakran visszadobta e szerep kimenetét. Beadás előtt minden tételt vess össze a tanítással: pontosan egy helyes opció, a mintaválasz és a rubrika egyezzen." },
  fail_bank_packet: { title: "Bankcsomag-bukás", roles: "byStep",
    rule: "A bankcsomag ebben a tantárgyban gyakran bukott a determinisztikus ellenőrzésen. Számold meg a darabszámokat a kvóta szerint, ellenőrizd a rubrikát és a mintaválaszt, és ne ismételj korábbi kérdést." },
  fail_lektor_blockers: { title: "Lektori blokkolás", roles: "byStep",
    rule: "A lektor ebben a tantárgyban gyakran blokkolta e szerep kimenetét. A tanítás minden állítását a forráshoz igazítsd, és a lektori jegyzetekben megnevezett helyeket célzottan javítsd." },
  fail_schema: { title: "Sémahiba", roles: "byStep", rule: "A kimenet gyakran nem felelt meg a kért sémának. Visszaadás előtt ellenőrizd a kötelező mezőket és típusokat." },
  fail_invalid_json: { title: "Érvénytelen JSON", roles: "byStep", rule: "A kimenet gyakran nem volt érvényes JSON. Kizárólag a kért JSON-t add vissza, magyarázó szöveg és kódblokk nélkül." },
  fail_length: { title: "Hosszkorlát", roles: "byStep", rule: "A kimenet gyakran elérte a hosszkorlátot. Tömören fogalmazz, és csak a kért mezőket add vissza." },
  fail_empty: { title: "Üres válasz", roles: "byStep", rule: "A válasz gyakran üres volt. Mindig a teljes kért JSON-t add vissza." },
  fail_coverage: { title: "Fogalomfedettség", roles: "byStep", rule: "A kimenet gyakran nem fedte le az összes kötelező fogalmat. Minden megadott fogalomra legyen tanítás és ellenőrző tétel." },
};
const FAILURE_KINDS = new Set(["invalid_json", "schema", "empty", "length", "gate", "lektor_blockers", "bank_packet", "provider", "coverage", "other"]);
const roleOfStep = (step: string): MemoryRole | null =>
  ["bank", "animator", "banks"].includes(step) ? "bank" : step === "author" ? "author" : step === "pedagogue" ? "pedagogue" : null;

/** A kártya karbantartott szövege és szerepei; null = nem kerülhet promptba (unknown, infrastructure, lektor_other, fail_provider…). */
export function codeEntry(code: string, step: string): { title: string; rule: string; roles: MemoryRole[] } | null {
  if (Object.hasOwn(SKILL_RULES, code)) {
    const [title, rule] = SKILL_RULES[code as SkillCode];
    const roles = SKILL_ROLES[code as SkillCode];
    return roles.length ? { title, rule, roles: [...roles] } : null;
  }
  const own = OWN_CODES[code];
  if (!own) return null;
  if (own.roles !== "byStep") return { ...own, roles: [...own.roles] };
  const role = roleOfStep(step);
  return role ? { ...own, roles: [role] } : null;
}

/* ---------- Bizonyíték-képzés ---------- */
type RunLike = Pick<WorkflowView, "id" | "executions" | "updatedAt" | "skillAudit" | "skillFindings" | "failures">;

/** Workflow-leletek + orkesztrátor-kimenetek egy futásból. Tantárgy nélkül nincs bizonyíték (fail-closed). */
export function evidenceFromRun(view: RunLike, subject: string | null): MemoryEvidence[] {
  if (!subject || !view?.id) return [];
  const key = `run:${view.id}:${view.skillAudit?.execution ?? view.executions ?? 0}`;
  const at = Number(view.skillAudit?.at ?? view.updatedAt ?? 0);
  const out: MemoryEvidence[] = [];
  for (const f of view.skillAudit?.findings ?? view.skillFindings ?? []) {
    for (const step of new Set([...(f.steps ?? []), f.step])) out.push({ subject, step: safeToken(step, "unknown"), code: safeToken(f.code, "unknown"), key, at });
  }
  for (const f of view.failures ?? []) {
    const kind = FAILURE_KINDS.has(f.kind) ? f.kind : "other";
    const summary = f.orchestrated?.outcome === "ok" && f.orchestrated.rootCause?.trim()
      ? redactSecrets(f.orchestrated.rootCause.trim()).slice(0, MEMORY_LIMITS.summaryChars) : undefined;
    out.push({ subject, step: safeToken(f.step, "unknown"), code: `fail_${kind}`, key, at: Number(f.at ?? at), ...(summary ? { summary } : {}) });
  }
  return out;
}

export type LektorNoteLike = { kind: string; subkind: string | null; severity: string; blockPath: string | null; createdAt: number };

/** Lektori BLOKKOLÓ jegyzetek egy jobból — egy job = egy bizonyíték kártyánként. */
export function evidenceFromLektorNotes(jobId: string, notes: readonly LektorNoteLike[], subject: string | null): MemoryEvidence[] {
  if (!subject || !jobId) return [];
  return notes.filter((n) => n.severity === "blocker").map((n) => ({
    subject,
    step: (n.blockPath ?? "").startsWith("experience") ? "bank" : "author",
    code: n.kind === "source_conflict"
      ? n.subkind === "not_in_map" ? "lektor_not_in_map" : n.subkind === "missing_coversConceptIds" ? "lektor_concept_binding" : "lektor_source_conflict"
      : n.kind === "coverage_gap" ? "lektor_coverage_gap" : "lektor_other",
    key: `job:${jobId}`,
    at: Number(n.createdAt) || 0,
  }));
}

/* ---------- Fold: dedup + upsert-számok ---------- */
export function statusAt(card: Pick<MemoryCard, "occurrences" | "lastSeen">, now: number): MemoryStatus {
  if (now - card.lastSeen > MEMORY_LIMITS.decayDays * DAY_MS) return "closed";
  return card.occurrences >= MEMORY_LIMITS.openAt ? "open" : "watch";
}

/**
 * A bizonyítékokat a meglévő kártyákra hajtja. `seen` = már rögzített `fingerprint|kulcs` párok (DB-események). Ugyanaz a kulcs egy
 * kártyán egyszer számol (a bemeneten belül is). Kimenet: az érintett kártyák új állapota és az új események.
 */
export function foldEvidence(existing: readonly MemoryCard[], seen: ReadonlySet<string>, evidence: readonly MemoryEvidence[], now: number) {
  // A bemeneten belüli összevonás: kártya + kulcs → legnagyobb idő, utolsó nem üres összefoglaló.
  const merged = new Map<string, MemoryEvidence & { fingerprint: string }>();
  for (const ev of evidence) {
    const fingerprint = cardFingerprint(ev.subject, ev.step, ev.code);
    const id = `${fingerprint}|${ev.key}`;
    const prev = merged.get(id);
    merged.set(id, { ...ev, fingerprint, at: Math.max(prev?.at ?? 0, ev.at), ...((ev.summary ?? prev?.summary) ? { summary: ev.summary ?? prev?.summary } : {}) });
  }
  const cards = new Map(existing.map((c) => [c.fingerprint, { ...c, evidence: [...c.evidence] }]));
  const touched = new Set<string>();
  const events: Array<{ fingerprint: string; key: string; at: number }> = [];
  for (const [id, ev] of [...merged].sort(([a], [b]) => a.localeCompare(b))) {
    if (seen.has(id)) continue;
    const card = cards.get(ev.fingerprint) ?? { fingerprint: ev.fingerprint, subject: ev.subject, step: ev.step, code: ev.code, occurrences: 0,
      firstSeen: ev.at, lastSeen: ev.at, status: "watch" as MemoryStatus, evidence: [], correctiveSummary: null, correctiveAt: null, correctiveCount: 0 };
    card.occurrences += 1;
    card.firstSeen = Math.min(card.firstSeen, ev.at);
    card.lastSeen = Math.max(card.lastSeen, ev.at);
    card.evidence = [...card.evidence.filter((k) => k !== ev.key), ev.key].slice(-MEMORY_LIMITS.evidenceRefs);
    if (ev.summary) {
      card.correctiveCount += 1;
      if (card.correctiveAt === null || ev.at >= card.correctiveAt) { card.correctiveSummary = ev.summary; card.correctiveAt = ev.at; }
    }
    cards.set(card.fingerprint, card);
    touched.add(card.fingerprint);
    events.push({ fingerprint: ev.fingerprint, key: ev.key, at: ev.at });
  }
  const out = [...touched].map((fp) => { const c = cards.get(fp)!; return { ...c, status: statusAt(c, now) }; });
  return { cards: out.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)), events };
}

/* ---------- Prompt ---------- */
const byRank = (a: MemoryCard, b: MemoryCard) => b.occurrences - a.occurrences || b.lastSeen - a.lastSeen || a.code.localeCompare(b.code) || a.step.localeCompare(b.step);

/** A job pillanatképe: a tantárgy NYITOTT kártyái (újraszámolt státusszal), rangsorolva, ≤ 40. */
export function memorySnapshot(cards: readonly MemoryCard[], subject: string, now: number): MemorySnapshot {
  const open = cards.filter((c) => c.subject === subject && statusAt(c, now) === "open").map((c) => ({ ...c, status: "open" as const }));
  return { version: 1, subject, at: now, cards: open.sort(byRank).slice(0, MEMORY_LIMITS.snapshotCards) };
}

export function isMemorySnapshot(value: unknown, subject: string): value is MemorySnapshot {
  const s = value as MemorySnapshot | undefined;
  return s?.version === 1 && s.subject === subject && typeof s.at === "number" && Array.isArray(s.cards);
}

/**
 * A szerep blokkja: csak a tantárgy (kettős őr) nyitott kártyái, szerepre szűrve, kódonként összevonva; ≤ 6 sor, ≤ 1 500 jel. Csak
 * karbantartott szöveg — a javító összefoglaló NEM kerül bele. Üres → "" (a hívó semmit sem fűz a prompthoz).
 */
export function memoryPromptBlock(cards: readonly MemoryCard[], subject: string, role: MemoryRole, now: number): string {
  const groups = new Map<string, { title: string; rule: string; occurrences: number; lastSeen: number; steps: Set<string> }>();
  for (const card of cards) {
    if (card.subject !== subject || statusAt(card, now) !== "open") continue;
    const entry = codeEntry(card.code, card.step);
    if (!entry?.roles.includes(role)) continue;
    const g = groups.get(card.code) ?? { title: entry.title, rule: entry.rule, occurrences: 0, lastSeen: 0, steps: new Set<string>() };
    g.occurrences += card.occurrences;
    g.lastSeen = Math.max(g.lastSeen, card.lastSeen);
    g.steps.add(card.step);
    groups.set(card.code, g);
  }
  const ranked = [...groups].sort(([ac, a], [bc, b]) => b.occurrences - a.occurrences || b.lastSeen - a.lastSeen || ac.localeCompare(bc));
  const header = `TANTÁRGYI MEMÓRIA (${subject}) — e tantárgy korábbi futásainak visszatérő hibái ebben a szerepben. Karbantartott szabályszöveg; a forrás, a séma és a kötelező kapuk változatlanok.`;
  const lines: string[] = [];
  let length = header.length;
  for (const [, g] of ranked) {
    if (lines.length >= MEMORY_LIMITS.promptCards) break;
    const line = `- ${g.title} (${g.occurrences} futásban; lépés: ${[...g.steps].sort().join(", ")}): ${g.rule}`;
    if (length + 1 + line.length > MEMORY_LIMITS.promptChars) continue;
    lines.push(line);
    length += 1 + line.length;
  }
  return lines.length ? `${header}\n${lines.join("\n")}` : "";
}

export const memoryBlockVersion = (block: string) => sha(block).slice(0, 12);

/** A job pillanatképéből a szerep blokkja — az idő a pillanatképé, így a job lépései ugyanazt a szöveget kapják. */
export const snapshotPromptBlock = (snapshot: MemorySnapshot | undefined, role: MemoryRole) =>
  snapshot ? memoryPromptBlock(snapshot.cards, snapshot.subject, role, snapshot.at) : "";
