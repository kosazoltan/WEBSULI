/**
 * IMPROVE-JOB-DUP (review #640 / #644): a javítás-job foglalásának döntése (tiszta, tesztelhető). A hívó a tananyag tanácsadó
 * zárja alatt olvassa ki az ÖSSZES `processing` sort: bármely friss job blokkol; ha mind lejárt, mindegyik lezárandó, és új job
 * indulhat. `staleAfterMs` nélkül minden `processing` sor friss (blokkol).
 */
export function reserveImprovementJob(active: ReadonlyArray<{ id: string; createdAt: Date }>, now: number, staleAfterMs?: number):
  { block: true } | { block: false; expire: string[] } {
  const stale = (row: { createdAt: Date }) => staleAfterMs !== undefined && now - row.createdAt.getTime() > staleAfterMs;
  if (active.some((row) => !stale(row))) return { block: true };
  return { block: false, expire: active.map((row) => row.id) };
}
