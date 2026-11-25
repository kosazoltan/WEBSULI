import assert from "node:assert/strict";
import test from "node:test";

/**
 * Vak 3. kör L3 — a `recordRun` ADDITÍV, opcionális `timeouts` mezője (a kihagyott / lejárt kérdések száma).
 * A régi hívók (mező nélkül) és a régi mentett adat (`totalTimeouts` nélkül) változatlanul működnek: hiányzó mező = 0.
 */
function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map<string, string>(Object.entries(initial));
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage, dispatchEvent: () => true };
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class { constructor(public type: string) {} };
  return data;
}

const base = { game: "space-asteroid-quiz", xpGained: 10, correctAnswers: 2, wrongAnswers: 1, maxStreak: 2 } as const;

test("a régi hívó (timeouts nélkül) és a régi mentett adat változatlanul működik: a hiányzó mező 0", async () => {
  installStorage({ "websuli.lifetime-stats": JSON.stringify({ totalXp: 5, totalGames: 1, totalCorrectAnswers: 3, totalWrongAnswers: 2, bestStreak: 1 }) });
  const { loadStats, recordRun } = await import("../client/src/lib/achievements");
  assert.equal(loadStats().totalTimeouts, 0, "régi mentés: nincs totalTimeouts → 0");
  recordRun({ ...base });
  const s = loadStats();
  assert.equal(s.totalTimeouts, 0, "timeouts nélküli hívás nem változtat");
  assert.equal(s.totalWrongAnswers, 3);
  assert.equal(s.totalGames, 2);
});

test("a timeouts mező összeadódik, és nem keveredik a rossz válaszokkal", async () => {
  installStorage();
  const { loadStats, recordRun } = await import("../client/src/lib/achievements");
  recordRun({ ...base, timeouts: 2 });
  recordRun({ ...base, timeouts: 1 });
  const s = loadStats();
  assert.equal(s.totalTimeouts, 3);
  assert.equal(s.totalWrongAnswers, 2, "a kihagyás nem rossz válasz");
  recordRun({ ...base, timeouts: -4 });
  recordRun({ ...base, timeouts: Number.NaN });
  assert.equal(loadStats().totalTimeouts, 3, "érvénytelen érték nem rontja el a számlálót");
});
