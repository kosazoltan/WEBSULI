/**
 * Adventi naptár — tároló (docs/specs/2026-11-18-adventi-naptar.md R7, 16.3, 16.8; végrehajtás: …-vegrehajtas.md „S2a”).
 * Alanyonként és évadonként EGY sor; a kiosztás (`plan`) és a válaszok (`doors`) körönként, JSON-ban. Minden írás egy
 * tranzakcióban, soronkénti zárral (`SELECT … FOR UPDATE`) megy: két egyidejű válasz nem írhatja felül egymást.
 * A modul a naplóba semmit nem ír (token, eszközazonosító, név nem kerülhet oda) — a hibát a hívó kezeli.
 */
import type { Pool, PoolClient } from "pg";
import type { AdventPlan } from "../../shared/advent/assignment";
import type { DoorRecord } from "../../shared/advent/rules";

export type AdventSubjectKind = "learner" | "player" | "device" | "preview";
export type AdventSubject = { kind: AdventSubjectKind; id: string };

/** Körönkénti terv és válaszok: a kulcs a kör száma. */
export type AdventPlans = Record<number, AdventPlan>;
export type AdventDoors = Record<number, Record<number, DoorRecord>>;

export type AdventRow = {
  id: string;
  season: number;
  subjectKind: AdventSubjectKind;
  subjectId: string;
  grade: number | null;
  round: number;
  plan: AdventPlans;
  doors: AdventDoors;
  finishedAt: Date | null;
  passedAt: Date | null;
  mailedTo: string[];
  createdAt: Date;
  updatedAt: Date;
};

/** A módosítható mezők; a hiányzó mező változatlan marad. */
export type AdventPatch = Partial<Pick<AdventRow, "grade" | "round" | "plan" | "doors" | "finishedAt" | "passedAt">>;

export const DEVICE_ROW_RETENTION_DAYS = 60;
export const PREVIEW_ROW_RETENTION_DAYS = 7;

type DbRow = {
  id: string; season: number; subject_kind: AdventSubjectKind; subject_id: string; grade: number | null; round: number;
  plan: AdventPlans | null; doors: AdventDoors | null; finished_at: Date | null; passed_at: Date | null; mailed_to: string[] | null;
  created_at: Date; updated_at: Date;
};

const COLUMNS = "id, season, subject_kind, subject_id, grade, round, plan, doors, finished_at, passed_at, mailed_to, created_at, updated_at";

function toRow(r: DbRow): AdventRow {
  return {
    id: r.id, season: r.season, subjectKind: r.subject_kind, subjectId: r.subject_id, grade: r.grade, round: r.round,
    plan: r.plan ?? {}, doors: r.doors ?? {}, finishedAt: r.finished_at, passedAt: r.passed_at, mailedTo: r.mailed_to ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export type AdventStore = ReturnType<typeof createAdventStore>;

/** A módosítandó sor a zár megszerzése előtt eltűnt (pl. közben átkerült a tanulóhoz) — a hívó 409-et ad. */
export class AdventRowGoneError extends Error {
  constructor() { super("advent: a sor közben megszűnt"); this.name = "AdventRowGoneError"; }
}

/** Megoldott ablakok száma a sor aktuális körében (a „jobb haladás” mércéje az átvételnél). */
export function solvedDoorsOf(row: Pick<AdventRow, "round" | "doors">): number {
  return Object.values(row.doors[row.round] ?? {}).filter((door) => door.attempts.some((attempt) => attempt.correct)).length;
}
const answeredAny = (row: Pick<AdventRow, "doors">): boolean => Object.values(row.doors).some((round) => Object.values(round).some((door) => door.attempts.length > 0));

/**
 * Névtelen → párosított átmenet (terv 21., tulajdonosi döntés 2026-11-18): melyik sor marad a tanulónál.
 * - nincs eszköz-sor, vagy abban nincs válasz → a tanulóé marad (az üres eszköz-sor törlődik);
 * - nincs tanulói sor → az eszköz sora átkerül;
 * - mindkettő van → a több megoldott ablakkal rendelkező; egyenlőségnél a tanulóé.
 */
export function adoptionChoice(learner: AdventRow | null, device: AdventRow | null): "none" | "drop-device" | "move-device" | "replace-learner" {
  if (!device) return "none";
  if (!answeredAny(device)) return "drop-device";
  if (!learner) return "move-device";
  return solvedDoorsOf(device) > solvedDoorsOf(learner) ? "replace-learner" : "drop-device";
}

export function createAdventStore(pool: Pick<Pool, "query" | "connect">) {
  return {
    /** Olvasás írás nélkül: a sor, vagy null, ha az alany még nem kezdte el a naptárat. */
    async read(season: number, subject: AdventSubject): Promise<AdventRow | null> {
      const found = await pool.query<DbRow>(`SELECT ${COLUMNS} FROM advent_progress WHERE season = $1 AND subject_kind = $2 AND subject_id = $3`, [season, subject.kind, subject.id]);
      return found.rows[0] ? toRow(found.rows[0]) : null;
    },

    /**
     * Zárolt módosítás: a sort (ha nincs) létrehozza, zárolja, és a `fn` által adott mezőket írja. A `fn` tiszta legyen (a
     * zár alatt fut); ha `null`-t ad, nincs írás (de egy most létrehozott sor megmarad); ha dob, MINDEN visszagördül — a most
     * létrehozott sor is, így sikertelen megnyitás nem hagy üres sort. `created`: ebben a hívásban jött-e létre a sor.
     */
    async mutate<T>(
      season: number,
      subject: AdventSubject,
      fn: (row: AdventRow, created: boolean) => { patch: AdventPatch | null; result: T },
    ): Promise<{ row: AdventRow; created: boolean; result: T }> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO advent_progress (season, subject_kind, subject_id, learner_id, player_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (season, subject_kind, subject_id) DO NOTHING RETURNING id`,
          [season, subject.kind, subject.id, subject.kind === "learner" ? subject.id : null, subject.kind === "player" ? subject.id : null],
        );
        const created = inserted.rows.length > 0;
        const locked = await client.query<DbRow>(
          `SELECT ${COLUMNS} FROM advent_progress WHERE season = $1 AND subject_kind = $2 AND subject_id = $3 FOR UPDATE`,
          [season, subject.kind, subject.id],
        );
        if (!locked.rows[0]) throw new AdventRowGoneError();
        const current = toRow(locked.rows[0]);
        const { patch, result } = fn(current, created);
        let row = current;
        if (patch) {
          const next = { ...current, ...patch };
          const updated = await client.query<DbRow>(
            `UPDATE advent_progress
                SET grade = $2, round = $3, plan = $4::jsonb, doors = $5::jsonb, finished_at = $6, passed_at = $7, updated_at = now()
              WHERE id = $1 RETURNING ${COLUMNS}`,
            [current.id, next.grade, next.round, JSON.stringify(next.plan), JSON.stringify(next.doors), next.finishedAt, next.passedAt],
          );
          row = toRow(updated.rows[0]!);
        }
        await client.query("COMMIT");
        return { row, created, result };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    /**
     * Névtelen → párosított átmenet egy tranzakcióban, mindkét sort zárolva (terv 21.): az \`adoptionChoice\` szerint az eszköz
     * sora átkerül a tanulóhoz, lecseréli a tanulóét, vagy törlődik — utána a gyereknek egyetlen élő sora van. Párhuzamos
     * kérésnél (a tanulói sor közben jött létre) egyszer újrapróbál.
     */
    async adopt(season: number, deviceId: string, learnerId: string): Promise<ReturnType<typeof adoptionChoice>> {
      for (let attempt = 0; attempt < 2; attempt++) {
        const client: PoolClient = await pool.connect();
        try {
          await client.query("BEGIN");
          const locked = await client.query<DbRow>(
            `SELECT ${COLUMNS} FROM advent_progress
              WHERE season = $1 AND ((subject_kind = 'device' AND subject_id = $2) OR (subject_kind = 'learner' AND subject_id = $3))
              ORDER BY id FOR UPDATE`,
            [season, deviceId, learnerId],
          );
          const rows = locked.rows.map(toRow);
          const device = rows.find((r) => r.subjectKind === "device") ?? null;
          const learner = rows.find((r) => r.subjectKind === "learner") ?? null;
          const choice = adoptionChoice(learner, device);
          if (choice === "replace-learner") await client.query(`DELETE FROM advent_progress WHERE id = $1`, [learner!.id]);
          if (choice === "move-device" || choice === "replace-learner") {
            await client.query(
              `UPDATE advent_progress SET subject_kind = 'learner', subject_id = $2, learner_id = $2, updated_at = now() WHERE id = $1`,
              [device!.id, learnerId],
            );
          }
          if (choice === "drop-device") await client.query(`DELETE FROM advent_progress WHERE id = $1`, [device!.id]);
          await client.query("COMMIT");
          return choice;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          // 23505: a tanulói sor a zárolás után, párhuzamosan jött létre — újra, most már az összehasonlító ágon.
          if ((error as { code?: unknown } | null)?.code === "23505" && attempt === 0) continue;
          throw error;
        } finally {
          client.release();
        }
      }
      return "none";
    },

    /**
     * A szülői levél foglalása a küldés ELŐTT (a `lesson-result-email.ts` mintája): a kulcs csak akkor kerül a listába, ha még
     * nincs benne — két egyidejű hívásból pontosan egy kap `true`-t. A kulcs `<kör>:<fajta>:<cím-lenyomat>` (terv 16.3).
     */
    async claimMail(id: string, key: string): Promise<boolean> {
      const got = await pool.query(`UPDATE advent_progress SET mailed_to = array_append(mailed_to, $2) WHERE id = $1 AND NOT ($2 = ANY(mailed_to)) RETURNING id`, [id, key]);
      return got.rows.length > 0;
    },

    /** A sikertelen küldés foglalásának felszabadítása (a következő hívás pótolhatja). */
    async releaseMail(id: string, key: string): Promise<void> {
      await pool.query(`UPDATE advent_progress SET mailed_to = array_remove(mailed_to, $2) WHERE id = $1`, [id, key]);
    },

    /**
     * Takarítás: a régóta nem használt névtelen (eszköz-) sorok és a régi előnézeti sorok törlése (terv E23), valamint a
     * korábbi évadok értesítő-foglalásai (terv 16.6). A tanulói és a játékos-sorok nem törlődnek itt.
     */
    async sweep(now: Date, currentSeason: number): Promise<{ devices: number; previews: number; announcements: number }> {
      const cutoff = (days: number) => new Date(now.getTime() - days * 86_400_000);
      const devices = await pool.query(`DELETE FROM advent_progress WHERE subject_kind = 'device' AND updated_at < $1`, [cutoff(DEVICE_ROW_RETENTION_DAYS)]);
      const previews = await pool.query(`DELETE FROM advent_progress WHERE subject_kind = 'preview' AND updated_at < $1`, [cutoff(PREVIEW_ROW_RETENTION_DAYS)]);
      const announcements = await pool.query(`DELETE FROM advent_announcements WHERE season < $1`, [currentSeason]);
      return { devices: devices.rowCount ?? 0, previews: previews.rowCount ?? 0, announcements: announcements.rowCount ?? 0 };
    },
  };
}
