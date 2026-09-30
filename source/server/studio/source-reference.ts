import type { Lesson } from "../../shared/lesson-schema";
import { evaluateOpenAnswer } from "../../shared/lesson-experience-score";
import { withSupportSkill } from "./support-skills";

/**
 * Spec 2026-09-30-nem-elakado-kozzetetel (D4): forrás-hivatkozás a gyereknek szóló szövegben.
 *
 * Élő mérés (Mezopotámia, 2026-09-30): a szerző és a bankmodell ~50 helyen írt „a forrás szerint …”, „… szerepel a
 * füzetben” fordulatot, a tanári tiltás ellenére; a lektor nem jelezte. A gyerek nem látja a forrást: a tartalmat
 * közvetlenül kell állítani. A biztonságos (bevezető) fordulatot a program törli; a többi figyelmeztetés marad.
 */

// Csak a HIVATKOZÓ fordulat (a forrás, a füzetben, forrás szerint) — a „Duna forrása” (földrajzi forrás) nem.
const MENTION = /(?<!\p{L})[Aa] (?:forrás|füzet|tankönyv)(?:ban|ben|ból|ből|ra|re|nak|nek|ot|et)?(?!\p{L})|(?<!\p{L})(?:forrás|füzet|tankönyv)(?:ban|ben)? szerint(?!\p{L})/u;
// Bevezető fordulat: mondat közbeni „, a forrás szerint,” → „,”; „A forrás szerint X” → „X” (mondatkezdő nagybetűvel).
const MID_SENTENCE = /,\s*a (?:forrás|füzet|tankönyv) szerint(?=[,.;:!?])/g;
const LEADING = /\b[Aa] (?:forrás|füzet|tankönyv) szerint,?\s+(\S)/g;
// Rubrika/azonosító mezők: nem gyereknek szóló szöveg (a rubrika a minta illesztéséhez kell).
const SKIP_KEYS = new Set(["id", "sourceHash", "required", "bonus", "coversConceptIds", "kind", "animKind", "params", "mode", "intent", "depth"]);

export type SourceReference = { path: string; text: string };

function walk(value: unknown, path: string, visit: (text: string, path: string) => string): unknown {
  if (typeof value === "string") return visit(value, path);
  if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}[${i}]`, visit));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SKIP_KEYS.has(k) ? v : walk(v, `${path}.${k}`, visit);
    return out;
  }
  return value;
}

/** A gyereknek szóló szövegrészek bejárása: a nem-ábra blokkok és a bank. */
function visitKidText(lesson: Lesson, visit: (text: string, path: string) => string): Lesson {
  const sections = lesson.sections.map((section, s) => ({
    ...section,
    heading: visit(section.heading, `sections[${s}].heading`),
    blocks: section.blocks.map((block, b) => (block.kind === "animate" ? block : walk(block, `sections[${s}].blocks[${b}]`, visit))),
  })) as Lesson["sections"];
  const experience = lesson.experience ? walk(lesson.experience, "experience", visit) as Lesson["experience"] : lesson.experience;
  return { ...lesson, sections, experience };
}

export function sourceReferenceFindings(lesson: Lesson): SourceReference[] {
  const found: SourceReference[] = [];
  visitKidText(lesson, (text, path) => { if (MENTION.test(text)) found.push({ path, text }); return text; });
  return found;
}

function stripText(text: string): string {
  return text
    .replace(MID_SENTENCE, "")
    .replace(LEADING, (_match, next: string, offset: number, whole: string) => {
      const before = whole.slice(0, offset).trimEnd();
      const sentenceStart = !before || /[.!?:]$/.test(before) || before.endsWith("**");
      return sentenceStart ? next.toLocaleUpperCase("hu") : next;
    });
}

/** Biztonságos törlés; egy feladat változása visszavonva, ha a saját mintája utána nem kapna teljes pontot. */
export function stripSourceReferences(lesson: Lesson): { lesson: Lesson; fixed: number } {
  let fixed = 0;
  const next = visitKidText(lesson, (text) => {
    const out = stripText(text);
    if (out !== text) fixed++;
    return out;
  });
  if (next.experience && lesson.experience) {
    next.experience = {
      ...next.experience,
      tasks: next.experience.tasks.map((task, i) => (evaluateOpenAnswer(task.sample, task).state === "ok" ? task : lesson.experience!.tasks[i])),
    };
  }
  return { lesson: next, fixed };
}

const PATH_TOKEN = /\.?([A-Za-z]+)|\[(\d+)\]/g;
function setAtPath(root: Record<string, unknown>, path: string, value: string): boolean {
  const keys = [...path.matchAll(PATH_TOKEN)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]));
  let node: unknown = root;
  for (const key of keys.slice(0, -1)) node = (node as Record<string | number, unknown> | undefined)?.[key];
  const last = keys.at(-1);
  if (!node || typeof node !== "object" || last === undefined || typeof (node as Record<string | number, unknown>)[last] !== "string") return false;
  (node as Record<string | number, unknown>)[last] = value;
  return true;
}
const numbersOf = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join("|");

export type RewriteCall = (system: string, user: string) => Promise<unknown>;
/** Az átíró modell (rövid, magyar, gyereknek szóló mondatok — a minőség fontosabb a pár centnél). */
export const TEXT_FIX_MODEL = "claude-opus-5-5";

/**
 * A biztonságosan nem törölhető hivatkozások (a forrás/füzet alanyként: „a forrás Istárt … nevezi”) átírása egy
 * modellhívással. Mérve a Mezopotámia-leckén: 55 hivatkozásból 13 volt gépiesen törölhető. Minden átírt mondat
 * ellenőrzött: nincs benne forrás-szó, a számai azonosak, a hossza közel az eredetihez; a feladat saját mintája
 * utána is teljes pontot kap — különben az eredeti marad.
 */
export async function rewriteSourceReferences(lesson: Lesson, call: RewriteCall): Promise<{ lesson: Lesson; rewritten: number; rejected: number }> {
  const findings = sourceReferenceFindings(lesson);
  if (!findings.length) return { lesson, rewritten: 0, rejected: 0 };
  const system = withSupportSkill("kid-text-fixer", "Írd át a kapott mondatokat a skill szerint. Kizárólag a kért JSON-t add vissza.");
  const user = JSON.stringify({ title: lesson.title, classroom: lesson.classroom, items: findings });
  const answer = await call(system, user) as { items?: Array<{ path?: unknown; text?: unknown }> } | null;
  const original = new Map(findings.map((f) => [f.path, f.text]));
  const next = structuredClone(lesson) as Lesson;
  let rewritten = 0, rejected = 0;
  for (const item of Array.isArray(answer?.items) ? answer!.items : []) {
    const path = typeof item?.path === "string" ? item.path : "";
    const before = original.get(path);
    const text = typeof item?.text === "string" ? item.text.trim() : "";
    const ok = before !== undefined && text && !MENTION.test(text) && numbersOf(text) === numbersOf(before)
      && text.length >= before.length * 0.4 && text.length <= before.length * 1.6;
    if (ok && setAtPath(next as unknown as Record<string, unknown>, path, text)) rewritten++;
    else rejected++;
  }
  if (next.experience && lesson.experience) {
    next.experience = {
      ...next.experience,
      tasks: next.experience.tasks.map((task, i) => (evaluateOpenAnswer(task.sample, task).state === "ok" ? task : lesson.experience!.tasks[i])),
    };
  }
  return { lesson: next, rewritten, rejected };
}
