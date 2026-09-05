/**
 * #158 — parent-dashboard aggregation: which material each student viewed and
 * what per-lesson result they reached. Pure functions, DB-free, so the exact
 * grouping the parent sees is unit-tested.
 */

export type MaterialViewRow = {
  userId: string | null;
  materialId: string;
  title: string;
  viewedAt: string;
};

export type MaterialViewSummary = {
  materialId: string;
  title: string;
  viewCount: number;
  lastViewed: string;
};

export function groupMaterialViewsByUser(
  rows: ReadonlyArray<MaterialViewRow>,
): Map<string, MaterialViewSummary[]> {
  const byUser = new Map<string, Map<string, MaterialViewSummary>>();
  for (const row of rows) {
    if (!row.userId) continue; // anonim megtekintés nem köthető tanulóhoz
    let mats = byUser.get(row.userId);
    if (!mats) {
      mats = new Map();
      byUser.set(row.userId, mats);
    }
    const cur = mats.get(row.materialId);
    if (!cur) {
      mats.set(row.materialId, {
        materialId: row.materialId,
        title: row.title,
        viewCount: 1,
        lastViewed: row.viewedAt,
      });
    } else {
      cur.viewCount += 1;
      if (row.viewedAt > cur.lastViewed) cur.lastViewed = row.viewedAt;
    }
  }
  const out = new Map<string, MaterialViewSummary[]>();
  for (const [userId, mats] of byUser) {
    out.set(
      userId,
      [...mats.values()].sort((a, b) => b.lastViewed.localeCompare(a.lastViewed)),
    );
  }
  return out;
}

export type LessonResultRow = {
  userId: string | null;
  lessonId: string;
  lessonTitle: string;
  correct: boolean;
};

export type LessonResultSummary = {
  lessonId: string;
  lessonTitle: string;
  total: number;
  correct: number;
  /** Kerekített százalék (0-100) — a szülő ezt látja. */
  percent: number;
};

export function groupLessonResultsByUser(
  rows: ReadonlyArray<LessonResultRow>,
): Map<string, LessonResultSummary[]> {
  const byUser = new Map<string, Map<string, { lessonTitle: string; total: number; correct: number }>>();
  for (const row of rows) {
    if (!row.userId) continue;
    let lessons = byUser.get(row.userId);
    if (!lessons) {
      lessons = new Map();
      byUser.set(row.userId, lessons);
    }
    const cur = lessons.get(row.lessonId) ?? { lessonTitle: row.lessonTitle, total: 0, correct: 0 };
    cur.total += 1;
    if (row.correct) cur.correct += 1;
    lessons.set(row.lessonId, cur);
  }
  const out = new Map<string, LessonResultSummary[]>();
  for (const [userId, lessons] of byUser) {
    out.set(
      userId,
      [...lessons.entries()].map(([lessonId, l]) => ({
        lessonId,
        lessonTitle: l.lessonTitle,
        total: l.total,
        correct: l.correct,
        percent: l.total === 0 ? 0 : Math.round((l.correct / l.total) * 100),
      })),
    );
  }
  return out;
}
