/**
 * A meglévő leckék arculatának mentése (docs/specs/2026-10-18-arculat-backfill.md).
 *
 *   npx tsx scripts/design-assets/backfill-lesson-art.mts                 # próbafutás (csak olvas)
 *   npx tsx scripts/design-assets/backfill-lesson-art.mts --write <mentés.json>   # mentés, majd írás egy tranzakcióban
 *   npx tsx scripts/design-assets/backfill-lesson-art.mts --restore <mentés.json> # a mentett json visszaírása
 *
 * Csak az `art` nélküli leckéket érinti (`json->'art' IS NULL`); a mag a lecke azonosítója, mint a lejátszóban és a javításnál.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { withReadOnlyDb, withWriteTransaction } from "../lib/read-only-db";
import { computeLessonArt } from "../../shared/lesson-art-compute";

type Row = { id: string; json: Record<string, unknown> };
const [mode, file] = process.argv.slice(2);

async function plan(query: <R>(sql: string, params?: unknown[]) => Promise<R[]>) {
  const stored = new Set((await query<{ id: string }>("SELECT id FROM design_assets")).map(r => r.id));
  const rows = await query<Row>("SELECT id, json FROM lessons WHERE json->'art' IS NULL ORDER BY id");
  return rows.map(r => ({ row: r, art: computeLessonArt(r.json, r.id, stored) })).filter(x => x.art && Object.keys(x.art).length);
}

if (mode === "--restore") {
  if (!file) throw new Error("--restore <mentés.json>");
  const backup = JSON.parse(readFileSync(file, "utf8")) as Row[];
  const n = await withWriteTransaction(async q => {
    let done = 0;
    for (const r of backup) done += (await q("UPDATE lessons SET json = $1 WHERE id = $2 RETURNING id", [JSON.stringify(r.json), r.id])).length;
    return done;
  });
  console.log(`visszaállítva: ${n}/${backup.length}`);
} else if (mode === "--write") {
  if (!file) throw new Error("--write <mentés.json>");
  const before = await withReadOnlyDb(q => plan(q));
  writeFileSync(file, JSON.stringify(before.map(x => x.row)), "utf8");
  console.log(`mentés: ${before.length} lecke → ${file}`);
  const n = await withWriteTransaction(async q => {
    const items = await plan(q);
    let done = 0;
    for (const { row, art } of items) {
      done += (await q("UPDATE lessons SET json = $1 WHERE id = $2 AND json->'art' IS NULL RETURNING id", [JSON.stringify({ ...row.json, art }), row.id])).length;
    }
    return done;
  });
  console.log(`írva: ${n}`);
} else {
  const items = await withReadOnlyDb(q => plan(q));
  console.log(`próbafutás — érintett leckék: ${items.length}`);
  for (const { row, art } of items) {
    const j = row.json as { title?: string; classroom?: number };
    console.log(`${String(j.classroom).padStart(2)} | ${String(j.title ?? "").slice(0, 45).padEnd(45)} | ${JSON.stringify(art)}`);
  }
}
