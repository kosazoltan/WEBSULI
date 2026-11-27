import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { reserveImprovementJob } from "../server/improve-job-reservation";

// IMPROVE-JOB-DUP (review #640 / #644): a javítás-job foglalása atomikus — két egyszerre érkező kérésből csak egy job indul.
const MIN = 60_000;
const row = (id: string, ageMin: number, now: number) => ({ id, createdAt: new Date(now - ageMin * MIN) });

test("bármely friss processing sor blokkol — akkor is, ha előtte lejárt sor áll (15 és 60 perces korlát)", () => {
  const now = Date.now();
  for (const limit of [15, 60]) {
    assert.deepEqual(reserveImprovementJob([row("old", limit + 5, now), row("fresh", 1, now)], now, limit * MIN), { block: true });
    assert.deepEqual(reserveImprovementJob([row("fresh", limit - 1, now)], now, limit * MIN), { block: true });
  }
});

test("ha minden processing sor lejárt, MINDEGYIK lezárul és új job indulhat; üresen nincs teendő", () => {
  const now = Date.now();
  assert.deepEqual(reserveImprovementJob([row("a", 70, now), row("b", 90, now)], now, 60 * MIN), { block: false, expire: ["a", "b"] });
  assert.deepEqual(reserveImprovementJob([], now, 60 * MIN), { block: false, expire: [] });
  assert.deepEqual(reserveImprovementJob([row("a", 999, now)], now, undefined), { block: true }, "lejárati korlát nélkül nem zárunk le");
});

test("két egymás utáni foglalás a zár alatt: az első jobot indít, a második (a már beszúrt friss sorral) blokkol", () => {
  const now = Date.now();
  const rows: Array<{ id: string; createdAt: Date }> = [row("stale", 120, now)];
  const reserve = () => {
    const d = reserveImprovementJob(rows, now, 60 * MIN);
    if (d.block) return null;
    for (const id of d.expire) rows.splice(rows.findIndex((r) => r.id === id), 1);
    rows.push({ id: `new-${rows.length}`, createdAt: new Date(now) });
    return rows[rows.length - 1].id;
  };
  assert.ok(reserve());
  assert.equal(reserve(), null);
  assert.equal(rows.length, 1);
});

test("a tárolás a zárat a kiolvasás és a beszúrás ELŐTT veszi fel, és az összes processing sort kiolvassa", () => {
  const src = fs.readFileSync("server/storage.ts", "utf8");
  const body = src.slice(src.indexOf("async createImprovedHtmlFile"), src.indexOf("async getImprovedHtmlFile"));
  const lock = body.indexOf("pg_advisory_xact_lock"), read = body.indexOf("improvedHtmlFiles.status} = 'processing'"), insert = body.indexOf(".insert(improvedHtmlFiles)");
  assert.ok(lock > 0 && lock < read && read < insert, "zár → kiolvasás → beszúrás sorrend");
  assert.match(body, /const active = await tx\.select/u, "az összes találat (nem csak az első)");
  assert.match(body, /reserveImprovementJob\(active/u);
});
