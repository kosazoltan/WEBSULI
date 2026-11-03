/**
 * Kézi leckeborító-csere az éles leckéken (docs/specs/2026-11-03-leckeborito.md) — CSAK az `art.picture` változik.
 *
 *   npx tsx scripts/design-assets/pin-lesson-covers.mts                       # próbafutás (csak olvas)
 *   npx tsx scripts/design-assets/pin-lesson-covers.mts --write <mentés.json>    # mentés, majd csere egy tranzakcióban
 *   npx tsx scripts/design-assets/pin-lesson-covers.mts --restore <mentés.json>  # az `art` visszaírása a mentésből
 *
 * A csere a katalógus tartalomkulcsú borítóját írja azokba a leckékbe, amelyeké még nem az (Antigoné kimarad). Írás előtt a teljes
 * sorok és az `art`-lista lemezre kerül; utána ugyanabban a tranzakcióban leckénként ellenőrzött, hogy az `art` nélküli kanonikus
 * hash nem változott — bármely eltérés esetén ROLLBACK.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { withReadOnlyDb, withWriteTransaction } from "../lib/read-only-db";
import { DESIGN_ASSET_CATALOG } from "../../shared/design-asset-catalog";
import { isLessonCoverId } from "../../shared/lesson-cover";
import { hashWithoutArt, pinnedArt, planPins, verifyPinned, type PinPlan, type PinRow } from "./pin-lesson-covers-lib";

type Query = <R>(sql: string, params?: unknown[]) => Promise<R[]>;
type Backup = { at: string; rows: PinRow[]; art: Array<{ id: string; title: string; before: Record<string, unknown> | null; after: string }> };
const [mode, file] = process.argv.slice(2);
const catalogCovers = new Set(DESIGN_ASSET_CATALOG.filter(a => a.kind === "cover" && isLessonCoverId(a.id)).map(a => a.id));

async function plan(q: Query, lock: boolean) {
  // A cél képének a táblában is meg kell lennie (az induló szinkron tölti) — különben a lejátszó végpontja 404-et adna.
  const stored = new Set((await q<{ id: string }>("SELECT id FROM design_assets WHERE id LIKE 'cover-l-%'")).map(r => r.id));
  const missing = [...catalogCovers].filter(id => !stored.has(id));
  if (missing.length) throw new Error(`${missing.length} katalógusborító még nincs a design_assets táblában (deploy/szinkron előtt?): ${missing.slice(0, 5).join(", ")}…`);
  const rows = await q<PinRow>(`SELECT id, html_file_id, json FROM lessons ORDER BY id${lock ? " FOR UPDATE" : ""}`);
  return { rows, plans: planPins(rows, catalogCovers) };
}

if (mode === "--write") {
  if (!file) throw new Error("--write <mentés.json>");
  const n = await withWriteTransaction(async q => {
    const { rows, plans } = await plan(q, true);
    const byId = new Map(rows.map(r => [r.id, r]));
    const backup: Backup = { at: new Date().toISOString(), rows: plans.map(p => byId.get(p.id)!), art: plans.map(p => ({ id: p.id, title: p.title, before: p.art, after: p.to })) };
    // Kizárólagos létrehozás: meglévő mentést nem írunk felül.
    writeFileSync(file, JSON.stringify(backup), { encoding: "utf8", flag: "wx" });
    console.log(`mentés: ${plans.length} lecke → ${file}`);
    for (const p of plans) {
      const [after] = await q<{ json: Record<string, unknown> }>("UPDATE lessons SET json = jsonb_set(json, '{art}', $2::jsonb, true) WHERE id = $1 RETURNING json", [p.id, JSON.stringify(pinnedArt(p))]);
      if (!after) throw new Error(`hiányzó lecke: ${p.id} — semmi sem íródott`);
      verifyPinned(p, after.json);
      console.log(`  ✓ ${p.id} | ${p.title.slice(0, 60)} | ${p.from ?? "—"} → ${p.to} | hash egyezik`);
    }
    return plans.length;
  });
  console.log(`csere kész: ${n} lecke (mindegyiknél az art nélküli hash egyezik)`);
} else if (mode === "--restore") {
  if (!file) throw new Error("--restore <mentés.json>");
  const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;
  const n = await withWriteTransaction(async q => {
    let done = 0;
    for (const item of backup.art) {
      const [cur] = await q<{ json: Record<string, unknown> }>("SELECT json FROM lessons WHERE id = $1 FOR UPDATE", [item.id]);
      if (!cur) throw new Error(`hiányzó lecke: ${item.id} — a visszaállítás leállt, semmi sem íródott`);
      const saved = backup.rows.find(r => r.id === item.id)!;
      if (hashWithoutArt(cur.json) !== hashWithoutArt(saved.json)) throw new Error(`a lecke azóta változott: ${item.id} — a visszaállítás leállt, semmi sem íródott`);
      const sqlText = item.before === null ? "UPDATE lessons SET json = json - 'art' WHERE id = $1 RETURNING json" : "UPDATE lessons SET json = jsonb_set(json, '{art}', $2::jsonb, true) WHERE id = $1 RETURNING json";
      const [after] = await q<{ json: Record<string, unknown> }>(sqlText, item.before === null ? [item.id] : [item.id, JSON.stringify(item.before)]);
      if (hashWithoutArt(after.json) !== hashWithoutArt(saved.json)) throw new Error(`visszaállítás utáni eltérés: ${item.id}`);
      done++;
    }
    return done;
  });
  console.log(`visszaállítva: ${n}/${backup.art.length}`);
} else {
  const plans: PinPlan[] = await withReadOnlyDb(async q => (await plan(q as Query, false)).plans);
  console.log(`próbafutás — cserélendő lecke: ${plans.length} (katalógusborító: ${catalogCovers.size})`);
  for (const p of plans) console.log(`${p.id} | ${p.title.slice(0, 60).padEnd(60)} | ${p.from ?? "—"} → ${p.to}`);
}
