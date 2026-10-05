import type { CatalogItemDraft, CatalogItemKind } from "./catalog-item";
import type { Classification } from "./classify";
import { verifyItem } from "./verify";

/**
 * Spec 2026-10-05-s3-katalogus-bank: a kinyert tételek (S1) + a lecke-besorolás (S2) → tantárgyi bank-sorok. Tiszta függvény.
 * Tulajdonosi döntések: a régi anyag szülő-ellenőrzött, a fúziós gép-ellenőrzött; a gépi ellenőrző JELÖL, nem dob ki; a jelölt
 * tétel admin-átnézésig szó szerint nem vehető át; minden tantárgy és ág külön bank — a tétel a lecke tantárgyát örökli.
 */
export type Trust = "parent_verified" | "pipeline_verified";
export type ItemStatus = "active" | "flagged" | "review" | "rejected";

export type LessonClassification =
  | { provenance: string; status: "agreed"; classification: Classification }
  | { provenance: string; status: "review"; candidates: Array<{ model: string; classification: Classification }>; reason: string }
  | { provenance: string; status: "unclassified"; reason: string };

/** A besorolatlan lecke tételeinek helye: NEM bank, csak az admin átnézési sora. */
export const UNSORTED_SUBJECT = "_besorolatlan";

export type BankRow = {
  subject: string;
  grade: number | null;
  topicArea: string | null;
  topic: string | null;
  lessonType: string | null;
  kind: CatalogItemKind;
  prompt: string;
  body: string | null;
  options: string[] | null;
  correctIndex: number | null;
  accepted: string[] | null;
  keywordGroups: string[][] | null;
  steps: string[] | null;
  pair: CatalogItemDraft["pair"] | null;
  conceptIds: string[] | null;
  provenances: string[];
  trust: Trust;
  status: Exclude<ItemStatus, "rejected">;
  checks: string[];
  fingerprint: string;
};

export const trustOf = (provenance: string): Trust => (provenance.startsWith("legacy_html:") ? "parent_verified" : "pipeline_verified");
const TRUST_RANK: Record<Trust, number> = { parent_verified: 2, pipeline_verified: 1 };

type LessonPlacement = { subject: string; agreed: boolean; grade: number | null; topicArea: string | null; topic: string | null; lessonType: string | null };

/**
 * A lecke helye: egyező besorolás → a tantárgy bankja; admin-döntés (`adminSubject`) → az a bank, egyezőként kezelve; eltérő
 * besorolás → az első jelölt tantárgya, de csak átnézési sorként; besorolatlan → `_besorolatlan`.
 */
export function placeLesson(c: LessonClassification | undefined, classroom: number | null, adminSubject?: string | null): LessonPlacement {
  const grade = (g: number | null | undefined) => (classroom && classroom > 0 ? classroom : g ?? null);
  const first = c?.status === "agreed" ? c.classification : c?.status === "review" ? c.candidates[0]?.classification : undefined;
  const base = { grade: grade(first?.grade), topicArea: first?.topicArea ?? null, topic: first?.topic ?? null, lessonType: first?.lessonType ?? null };
  if (adminSubject) return { ...base, subject: adminSubject, agreed: true };
  if (c?.status === "agreed") return { ...base, subject: c.classification.subject, agreed: true };
  if (c?.status === "review" && first) return { ...base, subject: first.subject, agreed: false };
  return { ...base, subject: UNSORTED_SUBJECT, agreed: false };
}

/** Egy tétel státusza: kulcs nélküli kvíz és gépi lelet → jelölt; nem egyező besorolású lecke → átnézendő. */
export function itemStatus(item: CatalogItemDraft, agreed: boolean): { status: BankRow["status"]; checks: string[] } {
  const checks = item.kind === "quiz_unkeyed" ? ["a helyes kulcs nem állapítható meg"] : verifyItem(item).problems;
  if (!agreed) return { status: "review", checks };
  return { status: checks.length ? "flagged" : "active", checks };
}

const STATUS_RANK: Record<BankRow["status"], number> = { review: 0, flagged: 1, active: 2 };

export function toBankRows(
  items: Array<CatalogItemDraft & { classroom?: number | null }>,
  classifications: readonly LessonClassification[],
  adminSubjects: ReadonlyMap<string, string> = new Map(),
): BankRow[] {
  const byLesson = new Map(classifications.map((c) => [c.provenance, c]));
  const rows = new Map<string, BankRow>();
  for (const item of items) {
    const place = placeLesson(byLesson.get(item.provenance), item.classroom ?? null, adminSubjects.get(item.provenance));
    const { status, checks } = itemStatus(item, place.agreed);
    const trust = trustOf(item.provenance);
    const key = `${place.subject}\u0001${item.fingerprint}`;
    const prev = rows.get(key);
    if (!prev) {
      rows.set(key, {
        subject: place.subject, grade: place.grade, topicArea: place.topicArea, topic: place.topic, lessonType: place.lessonType,
        kind: item.kind, prompt: item.prompt, body: item.body ?? null, options: item.options ?? null, correctIndex: item.correctIndex ?? null,
        accepted: item.accepted ?? null, keywordGroups: item.keywordGroups ?? null, steps: item.steps ?? null, pair: item.pair ?? null,
        conceptIds: item.conceptIds ?? null, provenances: [item.provenance], trust, status, checks, fingerprint: item.fingerprint,
      });
      continue;
    }
    // Ugyanaz a tétel több leckében: egy sor, minden forrás; a magasabb bizalmi szint és a hozzá tartozó téma marad; a legkisebb
    // évfolyam (ahol először előfordul); az egyező besorolású lecke tagsága erősebb az átnézendőnél.
    if (!prev.provenances.includes(item.provenance)) prev.provenances.push(item.provenance);
    if (TRUST_RANK[trust] > TRUST_RANK[prev.trust]) Object.assign(prev, { trust, topicArea: place.topicArea ?? prev.topicArea, topic: place.topic ?? prev.topic, lessonType: place.lessonType ?? prev.lessonType });
    if (place.grade !== null && (prev.grade === null || place.grade < prev.grade)) prev.grade = place.grade;
    if (STATUS_RANK[status] > STATUS_RANK[prev.status]) Object.assign(prev, { status, checks });
  }
  for (const row of rows.values()) row.provenances.sort();
  return [...rows.values()];
}

/** Bankonkénti összesítés (dry-run és admin-összefoglaló közös alakja). */
export function summarize(rows: readonly BankRow[]): Record<string, Record<BankRow["status"] | "total", number>> {
  const out: Record<string, Record<BankRow["status"] | "total", number>> = {};
  for (const r of rows) {
    const s = (out[r.subject] ??= { total: 0, active: 0, flagged: 0, review: 0 });
    s.total++; s[r.status]++;
  }
  return out;
}
