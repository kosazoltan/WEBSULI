/**
 * Adventi naptár — ki játszik, és mennyi az idő (docs/specs/2026-11-18-adventi-naptar.md R5, R6, 16.5; végrehajtás „S2b”).
 * Alany: párosított tanuló → tanulóhoz kötött játékos-fiók → játékos-fiók → névtelen eszköz. A token, az eszközazonosító és a név
 * SOHA nem kerül naplóba; ez a modul nem naplóz.
 */
import type { Request } from "express";
import type { Pool } from "pg";
import { firstNameOf } from "../../shared/daily-reminder";
import { adventDeviceId } from "../../shared/advent/contract";
import { resolveLearner, type ResolvedLearner } from "../learners";
import { userBannedSql } from "../player/account-store";
import { playerAccountsEnabled } from "../player/require-player";
import { getPlayerSessionId } from "../player/session";
import type { AdventSubjectKind } from "./store";

export type AdventResolvedSubject = {
  kind: AdventSubjectKind;
  id: string;
  /** A tanuló évfolyama a profiljából; játékosnál és eszköznél null (a sorban tárolt, egyszer megadott érték számít). */
  grade: number | null;
  firstName: string | null;
};

export type AdventResolution = {
  subject: AdventResolvedSubject | null;
  /** `invalid`: a kérés tanulói tokent hozott, de az érvénytelen / visszavont — a felület újrapárosítást kér (terv 16.5). */
  pairing: "ok" | "invalid" | "none";
};

export type AdventIdentityInput = { learnerToken?: unknown; device?: unknown };

export type AdventIdentityDeps = {
  resolveLearner: (token: unknown) => Promise<ResolvedLearner | null>;
  playersEnabled: () => boolean;
  sessionPlayerId: (req: Request) => string | null;
  /** A munkamenet játékosa: null, ha nincs ilyen vagy tiltott; `learner` a hozzá kötött tanuló (ha van). */
  player: (playerId: string) => Promise<{ id: string; learner: ResolvedLearner | null } | null>;
};

export function defaultAdventIdentityDeps(pool: Pick<Pool, "query">): AdventIdentityDeps {
  return {
    resolveLearner,
    playersEnabled: () => playerAccountsEnabled(),
    sessionPlayerId: getPlayerSessionId,
    async player(playerId) {
      const found = await pool.query<{ id: string; learner_id: string | null; learner_name: string | null; learner_grade: number | null }>(
        `SELECT p.id, l.id AS learner_id, l.name AS learner_name, l.grade AS learner_grade
           FROM player_accounts p LEFT JOIN learners l ON l.id = p.linked_learner_id
          WHERE p.id = $1 AND p.banned_at IS NULL
            AND NOT ${userBannedSql("p")}`,
        [playerId],
      );
      const row = found.rows[0];
      if (!row) return null;
      const learner = row.learner_id && row.learner_name !== null && row.learner_grade !== null
        ? { id: row.learner_id, name: row.learner_name, firstName: firstNameOf(row.learner_name), grade: row.learner_grade }
        : null;
      return { id: row.id, learner };
    },
  };
}

const fromLearner = (learner: ResolvedLearner): AdventResolvedSubject => ({ kind: "learner", id: learner.id, grade: learner.grade, firstName: learner.firstName });

export async function resolveAdventSubject(req: Request, input: AdventIdentityInput, deps: AdventIdentityDeps): Promise<AdventResolution> {
  const hasToken = typeof input.learnerToken === "string" && input.learnerToken.length > 0;
  let pairing: AdventResolution["pairing"] = "none";
  if (hasToken) {
    const learner = await deps.resolveLearner(input.learnerToken);
    if (learner) return { subject: fromLearner(learner), pairing: "ok" };
    pairing = "invalid";
  }
  if (deps.playersEnabled()) {
    const playerId = deps.sessionPlayerId(req);
    const player = playerId ? await deps.player(playerId) : null;
    if (player) {
      // A tanulóhoz kötött fiók ugyanazt a naptárat látja, mint a tanuló párosított eszköze.
      if (player.learner) return { subject: fromLearner(player.learner), pairing };
      return { subject: { kind: "player", id: player.id, grade: null, firstName: null }, pairing };
    }
  }
  const device = adventDeviceId.safeParse(input.device);
  if (device.success) return { subject: { kind: "device", id: device.data.toLowerCase(), grade: null, firstName: null }, pairing };
  return { subject: null, pairing };
}
