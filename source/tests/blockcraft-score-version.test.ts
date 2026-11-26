/**
 * J3a / D-04 (tulajdonosi döntés, 2026-11-19; terv: docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md, J3a „D-04”):
 * a Rúnabánya új pontskálája új pontkulcsot kap. A régi Kockavadász-rekord nem kerül az új listára, és nem vész el
 * (nincs nullázás, nincs átváltás).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { GAME_BEST_KEY, readBest, writeBest } from "../client/src/game-engine/mobile/bestScore";
import type { StorageLike } from "../client/src/game-engine/mobile/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEW_KEY = "block-craft-quiz-v2";
const LEGACY_KEY = "block-craft-quiz";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  } as StorageLike & { data: Record<string, string> };
}

/** Megjegyzések nélküli forrás (a megjegyzésben szereplő példák ne adjanak téves találatot). */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("D-04 — Rúnabánya pontkulcs", () => {
  it("a közös kulcs: új pontkulcs, a régi a játék azonosítója, a game_id oszlopba fér", async () => {
    const keys = await import("../shared/game-score-keys");
    assert.equal(keys.BLOCK_CRAFT_SCORE_KEY, NEW_KEY);
    assert.equal(keys.BLOCK_CRAFT_LEGACY_SCORE_KEY, LEGACY_KEY);
    assert.ok(keys.BLOCK_CRAFT_SCORE_KEY.length <= 64);
    const { BLOCK_CRAFT_GAME_ID } = await import("../client/src/lib/blockcraft/core");
    assert.equal(BLOCK_CRAFT_GAME_ID, LEGACY_KEY, "a játék azonosítója (útvonal, bank, jelvények) nem változik");
  });

  it("helyi rekord: a régi rekord nem látszik az új kulcson, és az új menet után is megmarad", () => {
    const storage = memoryStorage({ [GAME_BEST_KEY]: JSON.stringify({ [LEGACY_KEY]: 9999, "tsunami-english": 50 }) });
    assert.equal(readBest(storage, NEW_KEY), null, "a régi rekord nem kerülhet az új listára");
    assert.deepEqual(writeBest(storage, NEW_KEY, 120), { best: 120, isNewBest: true });
    assert.equal(readBest(storage, LEGACY_KEY), 9999, "a régi rekord nem veszhet el");
    assert.equal(readBest(storage, "tsunami-english"), 50);
    assert.equal(readBest(storage, NEW_KEY), 120);
  });

  it("a lap az új kulccsal ment helyben és küld a szerverre (régi kulcs-literál nincs)", () => {
    const src = code("client/src/pages/BlockCraftQuiz.tsx");
    assert.match(src, /useBestScore\(BLOCK_CRAFT_SCORE_KEY\)/);
    const post = src.slice(src.indexOf("postGameScore({"), src.indexOf("postGameScore({") + 400);
    assert.match(post, /gameId:\s*BLOCK_CRAFT_SCORE_KEY\b/);
    assert.doesNotMatch(src, /useBestScore\(\s*["']block-craft-quiz["']\s*\)/);
    assert.doesNotMatch(src, /gameId:\s*["']block-craft-quiz["']/);
  });

  it("migráció: az új kulcs katalógussora hozzáadó és ismételhető; régi pontsort egy migráció sem ír át / töröl", () => {
    const dir = join(ROOT, "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const sql = Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
    const adds = files.filter(
      (f) => /INSERT INTO "?games_catalog"?/i.test(sql[f]) && sql[f].includes(`'${NEW_KEY}'`) && /ON CONFLICT \("?id"?\) DO NOTHING/i.test(sql[f]),
    );
    assert.equal(adds.length, 1, `pontosan egy migráció vegye fel a(z) ${NEW_KEY} katalógussort`);
    for (const f of files) {
      assert.doesNotMatch(sql[f], /(UPDATE|DELETE FROM|TRUNCATE)\s+"?game_scores"?/i, `${f}: nincs nullázás / átváltás`);
    }
  });

  it("a lobbi-katalógus a pontkulcsot nem mutatja külön játékként, a szerver ezt használja", async () => {
    const { lobbyCatalog } = await import("../shared/game-score-keys");
    const rows = [{ id: LEGACY_KEY }, { id: NEW_KEY }, { id: "tsunami-english" }];
    assert.deepEqual(lobbyCatalog(rows).map((r) => r.id), [LEGACY_KEY, "tsunami-english"]);
    assert.match(code("server/gameScoreService.ts"), /lobbyCatalog\(/);
  });

  it("szülői / admin nézet: a két kulcs megkülönböztetett címkét kap", () => {
    const src = code("client/src/components/ParentDashboardPanel.tsx");
    assert.match(src, /"block-craft-quiz-v2":\s*\{\s*name:\s*"Kockavadász — Rúnabánya"/);
    assert.match(src, /"block-craft-quiz":\s*\{\s*name:\s*"Kockavadász \(régi pontozás\)"/);
  });
});
