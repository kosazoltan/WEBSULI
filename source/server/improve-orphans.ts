/**
 * Spec 2026-10-19-okositas-fazisjelzo (4): az okosítás / javítás elárvult futásainak lezárása.
 *
 * Mért (2026-10-19): a 09:56-os kitelepítés újraindította a szervert; a „Week 6” okosítás (c74c38f9) rekordja két órán át
 * `processing` maradt, és csak a 60 perces időkorlát utáni első lekérdezés zárta hibára. A stúdió `studio_jobs` / `one_step_runs`
 * sorait a boot-söprés zárja (#168, #183) — az `improved_html_files` sort semmi. Itt ugyanaz a szabály, a munkafolyamat-futás
 * bérletéhez kötve: élő bérletű futáshoz nem nyúlunk (deploykor a régi példány még befejezheti).
 */
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

export const ORPHAN_IMPROVE_ERROR = "A szerver újraindult az okosítás / javítás közben — töröld, és indítsd újra.";
/** A futásnapló nélküli rekord ennyi idő után árva (a futás indulásakor a rekord és a futás szinte egyszerre jön létre). */
export const NO_RUN_GRACE_MS = 5 * 60_000;
/** A bérlet lejárta után ennyit várunk (a 90 mp-es bérletet a motor folyamatosan megújítja). */
export const LEASE_GRACE_MS = 30_000;

export type ImproveOrphanRow = { id: string; createdAt: Date; runState: string | null; leaseUntil: Date | null; runUpdatedAt?: Date | null };

/** Tiszta döntés: mely `processing` rekordok árvák. */
export function orphanedImproveIds(rows: readonly ImproveOrphanRow[], now: number): string[] {
  return rows.filter((r) => {
    if (r.runState === null) return now - r.createdAt.getTime() > NO_RUN_GRACE_MS;
    // Végállapotú futás + még `processing` rekord: csak ha a futás is régen (> 5 perc) állt meg — a rekord frissítése a futás
    // lezárása UTÁN történik, a kettő közti pillanatban nem zárunk hibára egy épp elkészült jelöltet.
    if (r.runState !== "running" && r.runState !== "waiting") return now - (r.runUpdatedAt ?? r.createdAt).getTime() > NO_RUN_GRACE_MS;
    return r.leaseUntil === null ? now - r.createdAt.getTime() > NO_RUN_GRACE_MS : r.leaseUntil.getTime() < now - LEASE_GRACE_MS;
  }).map((r) => r.id);
}

export async function sweepImproveJobs(): Promise<number> {
  // Review #323: dinamikus import — a tiszta döntésfüggvény importja (egységteszt) ne nyisson adatbázis-kapcsolatot.
  const { db } = await import("./db");
  const { rows } = await db.execute(sql`
    SELECT f.id, f.created_at, w.state AS run_state, w.lease_until, w.updated_at AS run_updated_at
    FROM improved_html_files f
    LEFT JOIN lesson_workflow_runs w ON w.id = f.id
    WHERE f.status = 'processing'`);
  const parsed: ImproveOrphanRow[] = (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), createdAt: new Date(String(r.created_at)), runState: (r.run_state as string | null) ?? null,
    leaseUntil: r.lease_until ? new Date(String(r.lease_until)) : null, runUpdatedAt: r.run_updated_at ? new Date(String(r.run_updated_at)) : null,
  }));
  const ids = orphanedImproveIds(parsed, Date.now());
  for (const id of ids) {
    // Csak a még mindig `processing` sort írjuk (versenyhelyzet: közben befejeződhetett).
    await db.execute(sql`UPDATE improved_html_files SET status = 'error', improvement_notes = ${ORPHAN_IMPROVE_ERROR} WHERE id = ${id} AND status = 'processing'`);
    logger.warn(`[IMPROVE] Elárvult futás lezárva: ${id}`);
  }
  return ids.length;
}

/** Spec 2026-10-19-eroforras-s1 + review #324: 15 percenként — biztosan hosszabb a Neon 5 perces elalvási küszöbénél. */
export const IMPROVE_SWEEP_INTERVAL_MS = 15 * 60_000;

/** Indításkor és utána 15 percenként (a deploykori régi példány bérletének lejárta után zár). */
export function startImproveOrphanSweeper(): void {
  const run = () => void sweepImproveJobs().catch((error) => logger.error("[IMPROVE] Az elárvult futások söprése nem sikerült:", error));
  run();
  setInterval(run, IMPROVE_SWEEP_INTERVAL_MS).unref();
}
