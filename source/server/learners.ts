import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { extraEmailAddresses, learnerActivity, learners, type Learner } from "../shared/schema";
import { firstNameOf } from "../shared/daily-reminder";
import { learnerLinkSecret, parseLearnerToken, signLearnerToken } from "./lib/learner-token";
import { logger } from "./lib/logger";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S1): a nevesített e-mail-címekből tanulók, a személyes link tokenje
 * és annak feloldása. A gyerekek neve az adatbázisban él; naplóba nem kerül.
 */

type EmailRow = { id: string; studentName: string | null; classrooms: number[] | null; isActive: boolean; updatedAt: Date; learnerId: string | null };
type LearnerRow = Pick<Learner, "id" | "name" | "grade">;
export type LearnerSyncPlan = {
  create: Array<{ name: string; grade: number }>;
  grade: Array<{ id: string; grade: number }>;
  link: Array<{ emailId: string; name: string | null }>;
};

const keyOf = (name: string) => name.trim().toLocaleLowerCase("hu");

/** Tiszta terv: név szerint (kis-nagybetűtől függetlenül) egy tanuló; az évfolyam a legutóbb módosított aktív cím első osztálya. */
export function planLearnerSync(rows: readonly EmailRow[], existing: readonly LearnerRow[]): LearnerSyncPlan {
  const byKey = new Map(existing.map((l) => [keyOf(l.name), l]));
  const wanted = new Map<string, { name: string; grade: number; rank: [number, number] }>();
  for (const r of rows) {
    const name = r.studentName?.trim();
    const grade = r.classrooms?.[0];
    if (!name || grade === undefined) continue;
    const rank: [number, number] = [r.isActive ? 1 : 0, r.updatedAt.getTime()];
    const prev = wanted.get(keyOf(name));
    if (!prev || rank[0] > prev.rank[0] || (rank[0] === prev.rank[0] && rank[1] > prev.rank[1])) wanted.set(keyOf(name), { name, grade, rank });
  }
  const plan: LearnerSyncPlan = { create: [], grade: [], link: [] };
  for (const [key, w] of wanted) {
    const have = byKey.get(key);
    if (!have) plan.create.push({ name: w.name, grade: w.grade });
    else if (have.grade !== w.grade) plan.grade.push({ id: have.id, grade: w.grade });
  }
  for (const r of rows) plan.link.push({ emailId: r.id, name: r.studentName?.trim() ? r.studentName.trim() : null });
  return plan;
}

// Review #301: a szinkronok sorban futnak — folyamaton belül egy lánc, folyamatok (példányok) között tranzakciós tanácsadó zár; így egy
// régebbi pillanatkép nem írhatja vissza egy frissebb futás eredményét.
const SYNC_LOCK_KEY = 7_204_318;
let syncChain: Promise<void> = Promise.resolve();

/** A tanulók és a címek kapcsolatának szinkronja; minden e-mail-cím módosítás után és induláskor. Sosem dob. */
export function syncLearners(): Promise<void> {
  const run = syncChain.then(syncOnce, syncOnce);
  syncChain = run;
  return run;
}

async function syncOnce(): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`);
      const rows = await tx.select({ id: extraEmailAddresses.id, studentName: extraEmailAddresses.studentName, classrooms: extraEmailAddresses.classrooms, isActive: extraEmailAddresses.isActive, updatedAt: extraEmailAddresses.updatedAt, learnerId: extraEmailAddresses.learnerId }).from(extraEmailAddresses);
      const existing = await tx.select({ id: learners.id, name: learners.name, grade: learners.grade }).from(learners);
      const plan = planLearnerSync(rows, existing);
      for (const c of plan.create) await tx.insert(learners).values(c).onConflictDoNothing();
      for (const g of plan.grade) await tx.update(learners).set({ grade: g.grade, updatedAt: new Date() }).where(eq(learners.id, g.id));
      const all = await tx.select({ id: learners.id, name: learners.name }).from(learners);
      const idByKey = new Map(all.map((l) => [keyOf(l.name), l.id]));
      for (const l of plan.link) {
        const learnerId = l.name ? idByKey.get(keyOf(l.name)) ?? null : null;
        const row = rows.find((r) => r.id === l.emailId);
        if (row && row.learnerId !== learnerId) await tx.update(extraEmailAddresses).set({ learnerId }).where(eq(extraEmailAddresses.id, l.emailId));
      }
    });
  } catch (error) {
    logger.warn("[LEARNERS] szinkron hiba", { error: error instanceof Error ? error.message : String(error) });
  }
}

export type ResolvedLearner = { id: string; name: string; firstName: string; grade: number };

/** Érvényes, nem visszavont token → tanuló; minden más → null (névtelen). */
export async function resolveLearner(token: unknown): Promise<ResolvedLearner | null> {
  const secret = learnerLinkSecret();
  const parsed = secret ? parseLearnerToken(token, secret) : null;
  if (!parsed) return null;
  const [row] = await db.select().from(learners).where(eq(learners.id, parsed.id));
  if (!row || row.tokenVersion !== parsed.version) return null;
  return { id: row.id, name: row.name, firstName: firstNameOf(row.name), grade: row.grade };
}

/** A tanuló aktuális (visszavonás után új) tokenje; titok nélkül null. */
export function learnerTokenFor(id: string, version: number): string | null {
  const secret = learnerLinkSecret();
  return secret ? signLearnerToken(id, version, secret) : null;
}

/** Tevékenység (megtekintés / eredmény) a tanuló naplójába; sosem dob — a tanuló felülete nem függ tőle. */
export async function recordLearnerActivity(entry: { learnerId: string; materialId: string | null; kind: "view" | "result"; percent?: number | null; summary?: string | null }): Promise<void> {
  try {
    await db.insert(learnerActivity).values({ learnerId: entry.learnerId, materialId: entry.materialId, kind: entry.kind, percent: entry.percent ?? null, summary: entry.summary ? entry.summary.slice(0, 200) : null });
  } catch (error) {
    logger.warn("[LEARNERS] tevékenység rögzítési hiba", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Minden eszköz párosításának visszavonása (S4 admin). */
export async function rotateLearnerToken(id: string): Promise<void> {
  await db.update(learners).set({ tokenVersion: sql`${learners.tokenVersion} + 1`, updatedAt: new Date() }).where(eq(learners.id, id));
}
