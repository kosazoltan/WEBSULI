import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAY_GAME_IDS } from "../client/src/game-engine/play/types";

/**
 * J0b — pontszám-szerződés őr (végrehajtás J0b 10. lépés, K.2 „Pontszám-szerződés”; terv 4.3, J12).
 *
 * A `POST /api/games/score` zod-sémája és a `gameId`-k a J-szeletekben nem változhatnak: a ranglista, a régi kliensek és a
 * szerveroldali tárolás erre épül. A séma szövegét a `S/routes.ts`-ből másoltuk (2026-11-16, `19aa86e6`), szóköz- és
 * komment-normalizálva hasonlítjuk. Egyetlen tervezett kivétel: a JM0 opcionális `runId: z.string().uuid().optional()`
 * mezője (terv J12: „a JM0 csak opcionális `runId` mezőt ad”) — ez lehet ott, más nem.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function squash(s: string): string {
  return s.replace(/\s+/g, "").replace(/'/g, '"').replace(/,(?=[}\]])/g, "").replace(/,$/, "");
}

const SCHEMA_FIELDS =
  'gameId: z.string().min(1).max(64), difficulty: z.enum(["easy","normal","hard"]), runXp: z.number().int().min(0).max(200000), runStreak: z.number().int().min(0).max(10000), runSeconds: z.number().int().min(0).max(86400)';
const JM0_RUN_ID = "runId: z.string().uuid().optional()";

function scoreSchemaBody(source = readFileSync(join(root, "server/routes.ts"), "utf8")): string {
  const src = stripComments(source);
  const m = /submitGameScoreSchema\s*=\s*z\.object\(\{([\s\S]*?)\}\)\s*;/.exec(src);
  assert.ok(m, "a submitGameScoreSchema = z.object({...}) nem található a server/routes.ts-ben");
  return squash(m[1]!);
}

test("a score zod-séma szövege változatlan (csak a JM0 opcionális runId mezője lehet mellette)", () => {
  const body = scoreSchemaBody();
  const allowed = [squash(SCHEMA_FIELDS), squash(`${SCHEMA_FIELDS}, ${JM0_RUN_ID}`)];
  assert.ok(allowed.includes(body), `a score-séma megváltozott:\n${body}`);
});

test("az őr érzékeny: más mező vagy más korlát bukik", () => {
  const allowed = [squash(SCHEMA_FIELDS), squash(`${SCHEMA_FIELDS}, ${JM0_RUN_ID}`)];
  assert.ok(!allowed.includes(squash(SCHEMA_FIELDS.replace("max(200000)", "max(300000)"))));
  assert.ok(!allowed.includes(squash(`${SCHEMA_FIELDS}, extra: z.string()`)));
  assert.ok(allowed.includes(squash(SCHEMA_FIELDS.replace(/\s/g, "  "))), "a szóköz nem számít");
  // A JM0 (PR #443) alakja kommenttel: elfogadott.
  const jm0 = [
    "  const submitGameScoreSchema = z.object({",
    "    gameId: z.string().min(1).max(64),",
    '    difficulty: z.enum(["easy", "normal", "hard"]),',
    "    runXp: z.number().int().min(0).max(200000),",
    "    runStreak: z.number().int().min(0).max(10000),",
    "    runSeconds: z.number().int().min(0).max(86400),",
    "    // JM0: opcionális újraküldés-azonosító (régi kliens nélküle is működik); NEM csalásvédelem.",
    "    runId: z.string().uuid().optional(),",
    "  });",
  ].join("\n");
  assert.ok(allowed.includes(scoreSchemaBody(jm0)));
});

test("a P/Games.tsx FALLBACK_CATALOG azonosítói a hét PlayGameId-val egyeznek", () => {
  const src = stripComments(readFileSync(join(root, "client/src/pages/Games.tsx"), "utf8"));
  const start = src.indexOf("const FALLBACK_CATALOG");
  assert.ok(start >= 0, "FALLBACK_CATALOG hiányzik");
  const end = src.indexOf("];", start);
  const block = src.slice(start, end);
  const ids = [...block.matchAll(/\bid:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(ids.slice().sort(), PLAY_GAME_IDS.slice().sort());
  assert.equal(new Set(PLAY_GAME_IDS).size, 7);
});
