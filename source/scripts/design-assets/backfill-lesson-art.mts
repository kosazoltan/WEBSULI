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
/** Kulcssorrendtől független összehasonlítás (a jsonb nem őrzi a kulcsok sorrendjét). */
const stableJson = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

async function plan(query: <R>(sql: string, params?: unknown[]) => Promise<R[]>) {
  const stored = new Set((await query<{ id: string }>("SELECT id FROM design_assets")).map(r => r.id));
  const rows = await query<Row>("SELECT id, json FROM lessons WHERE json->'art' IS NULL ORDER BY id");
  // Review #283: kép nélküli eredményt (pl. csak `topic`) nem írunk — a lejátszó azt úgysem használná, és a sor retry-képes marad.
  return rows.map(r => ({ row: r, art: computeLessonArt(r.json, r.id, stored) })).filter(x => !!x.art?.picture);
}

if (mode === "--restore") {
  if (!file) throw new Error("--restore <mentés.json>");
  const backup = JSON.parse(readFileSync(file, "utf8")) as Row[];
  // Review #283: csak akkor állítunk vissza, ha a sor az `art` kulcson kívül változatlan (különben egy azóta javított leckét
  // írnánk felül); bármely eltérés vagy hiányzó sor az egész tranzakciót leállítja.
  const n = await withWriteTransaction(async q => {
    let done = 0;
    for (const r of backup) {
      const [cur] = await q<{ json: Record<string, unknown> }>("SELECT json FROM lessons WHERE id = $1 FOR UPDATE", [r.id]);
      if (!cur) throw new Error(`hiányzó lecke: ${r.id} — a visszaállítás leállt, semmi sem íródott`);
      const { art: _art, ...rest } = cur.json;
      if (stableJson(rest) !== stableJson(r.json)) throw new Error(`a lecke azóta változott: ${r.id} — a visszaállítás leállt, semmi sem íródott`);
      done += (await q("UPDATE lessons SET json = $1 WHERE id = $2 RETURNING id", [JSON.stringify(r.json), r.id])).length;
    }
    return done;
  });
  console.log(`visszaállítva: ${n}/${backup.length}`);
} else if (mode === "--write") {
  if (!file) throw new Error("--write <mentés.json>");
  // Review #283: a mentés és az írás ugyanabból, az író tranzakcióban egyszer meghatározott sorhalmazból készül; a mentés az
  // írás előtt kerül lemezre (hiba esetén a tranzakció visszagördül).
  const n = await withWriteTransaction(async q => {
    const items = await plan(q);
    // Review #283: kizárólagos létrehozás — meglévő mentést nem írunk felül (egy ismételt futás üres listája törölné a pontot).
    writeFileSync(file, JSON.stringify(items.map(x => x.row)), { encoding: "utf8", flag: "wx" });
    console.log(`mentés: ${items.length} lecke → ${file}`);
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
