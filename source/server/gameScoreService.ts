import { db } from "./db";
import {
  users,
  emailSubscriptions,
  extraEmailAddresses,
  gamesCatalog,
  gameScores,
  type User,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const ALLOWED_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type GameDifficulty = (typeof ALLOWED_DIFFICULTIES)[number];

export async function isEmailListMember(email: string | null | undefined): Promise<boolean> {
  if (!email || !email.trim()) return false;
  const normalized = email.trim().toLowerCase();

  const [sub] = await db
    .select({ id: emailSubscriptions.id })
    .from(emailSubscriptions)
    .where(
      and(
        eq(sql`lower(${emailSubscriptions.email})`, normalized),
        eq(emailSubscriptions.isSubscribed, true),
      ),
    )
    .limit(1);
  if (sub) return true;

  const [extra] = await db
    .select({ id: extraEmailAddresses.id })
    .from(extraEmailAddresses)
    .where(
      and(
        eq(sql`lower(${extraEmailAddresses.email})`, normalized),
        eq(extraEmailAddresses.isActive, true),
      ),
    )
    .limit(1);
  return !!extra;
}

export async function getGameSyncEligibility(user: User | null | undefined): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  if (!user) return { eligible: false, reason: "not_logged_in" };
  if (!user.googleId) return { eligible: false, reason: "google_only" };
  if (!user.email) return { eligible: false, reason: "no_email" };
  const onList = await isEmailListMember(user.email);
  if (!onList) return { eligible: false, reason: "not_on_mailing_list" };
  return { eligible: true };
}

function formatDisplayName(firstName: string | null, lastName: string | null): string {
  const f = firstName?.trim() || "Játékos";
  const l = lastName?.trim();
  if (l && l.length > 0) return `${f} ${l.charAt(0).toUpperCase()}.`;
  return f;
}

export async function listGamesCatalog() {
  return await db.select().from(gamesCatalog).orderBy(gamesCatalog.sortOrder, gamesCatalog.id);
}

export async function getLeaderboard(gameId: string, difficulty: string, limit: number) {
  const lim = Math.min(50, Math.max(1, Math.floor(limit)));
  const rows = await db
    .select({
      bestRunXp: gameScores.bestRunXp,
      bestStreak: gameScores.bestStreak,
      bestRunSeconds: gameScores.bestRunSeconds,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(gameScores)
    .innerJoin(users, eq(gameScores.userId, users.id))
    .where(and(eq(gameScores.gameId, gameId), eq(gameScores.difficulty, difficulty)))
    .orderBy(desc(gameScores.bestRunXp), desc(gameScores.bestStreak))
    .limit(lim);

  return rows.map((r, rank) => ({
    rank: rank + 1,
    displayName: formatDisplayName(r.firstName, r.lastName),
    bestRunXp: r.bestRunXp,
    bestStreak: r.bestStreak,
    bestRunSeconds: r.bestRunSeconds,
  }));
}

export async function submitGameScore(params: {
  userId: string;
  gameId: string;
  difficulty: string;
  runXp: number;
  runStreak: number;
  runSeconds: number;
}) {
  const diff = params.difficulty as string;
  if (!ALLOWED_DIFFICULTIES.includes(diff as GameDifficulty)) {
    throw new Error("invalid_difficulty");
  }

  const runXp = Math.max(0, Math.min(200_000, Math.floor(Number(params.runXp) || 0)));
  const runStreak = Math.max(0, Math.min(10_000, Math.floor(Number(params.runStreak) || 0)));
  const runSeconds = Math.max(0, Math.min(86_400, Math.floor(Number(params.runSeconds) || 0)));

  const [existing] = await db
    .select()
    .from(gameScores)
    .where(
      and(
        eq(gameScores.userId, params.userId),
        eq(gameScores.gameId, params.gameId),
        eq(gameScores.difficulty, diff),
      ),
    )
    .limit(1);

  const now = new Date();
  if (!existing) {
    const [inserted] = await db
      .insert(gameScores)
      .values({
        userId: params.userId,
        gameId: params.gameId,
        difficulty: diff,
        totalXp: runXp,
        bestRunXp: runXp,
        bestStreak: runStreak,
        bestRunSeconds: runSeconds,
        gamesPlayed: 1,
        updatedAt: now,
      })
      .returning();
    return inserted;
  }

  const newTotal = existing.totalXp + runXp;
  const newBestRun = Math.max(existing.bestRunXp, runXp);
  const newBestStreak = Math.max(existing.bestStreak, runStreak);
  const newBestSeconds = Math.max(existing.bestRunSeconds, runSeconds);

  const [updated] = await db
    .update(gameScores)
    .set({
      totalXp: newTotal,
      bestRunXp: newBestRun,
      bestStreak: newBestStreak,
      bestRunSeconds: newBestSeconds,
      gamesPlayed: existing.gamesPlayed + 1,
      updatedAt: now,
    })
    .where(eq(gameScores.id, existing.id))
    .returning();

  return updated;
}
