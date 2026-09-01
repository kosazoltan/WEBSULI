import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * AUDIT 2026-09-01 — statikus őrök olyan javításokra, amelyek DB nélkül nem futtathatók,
 * de a regressziójuk szövegszinten egyértelműen felismerhető.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("scheduledPublishing: a publikálás a html_files/user_id táblát frissíti (nem a nem létező \"htmlFiles\")", () => {
  const src = read("server/scheduledPublishing.ts");
  assert.ok(!/UPDATE\s+"htmlFiles"/.test(src), 'nincs UPDATE "htmlFiles"');
  assert.ok(!/SET\s+"userId"/.test(src), 'nincs SET "userId"');
  assert.match(src, /UPDATE\s+html_files/);
  assert.match(src, /SET\s+user_id\s*=/);
});

test("games_catalog: a kliens által használt összes gameId-nek van katalógus-sora a migrációkban", () => {
  const migrations = ["0002_add_game_scores.sql", "0003_games_wordladder_blockcraft.sql", "0007_games_catalog_asteroid_brainrot.sql"]
    .map((f) => read(join("migrations", f)))
    .join("\n");
  for (const id of ["tsunami-english", "word-ladder-hu-en", "speed-quiz-math", "block-craft-quiz", "space-asteroid-quiz", "brain-rot-steal"]) {
    assert.ok(migrations.includes(`'${id}'`), `games_catalog tartalmazza: ${id}`);
  }
});

test("gameQuizGeneratorService: üres validItems esetén nem deaktiválja a régi kvízeket", () => {
  const src = read("server/gameQuizGeneratorService.ts");
  const guard = src.indexOf("validItems.length === 0");
  const deactivate = src.indexOf(".set({ isActive: false })");
  assert.ok(guard > -1 && deactivate > -1);
  assert.ok(guard < deactivate, "az üres-lista kapu a deaktiválás ELŐTT van");
});

test("improveAsync: a stream 'error' chunk hibát dob (csonka HTML nem mentődik)", () => {
  const src = read("server/improveAsync.ts");
  assert.match(src, /if \(chunk\.type === 'error'\)\s*\{\s*throw new Error/);
  assert.match(src, /improvedHtml\.replace\(jsContent, \(\) => fixedJs\)/);
});

test("index.ts: SSE válasz nincs tömörítve; nagy body csak session-sütivel", () => {
  const src = read("server/index.ts");
  assert.match(src, /text\/event-stream/);
  assert.match(src, /hasSessionCookie\(req\)/);
});

test("migrate.ts: a TLS-tanúsítvány ellenőrzés prod-ban nincs kikapcsolva", () => {
  const src = read("server/migrate.ts");
  assert.ok(!src.includes("{ rejectUnauthorized: false }"), "nincs feltétel nélküli rejectUnauthorized:false");
  assert.match(src, /rejectUnauthorized: process\.env\.NODE_ENV === 'production'/);
});

test("EnhancedMaterialCreator: az AI-generált előnézet iframe nem kap allow-same-origin-t", () => {
  const src = read("client/src/components/EnhancedMaterialCreator.tsx");
  const sandboxes = src.match(/sandbox="[^"]*"/g) ?? [];
  assert.ok(sandboxes.length >= 2, "van előnézeti iframe");
  for (const s of sandboxes) {
    assert.ok(!s.includes("allow-same-origin"), `nincs allow-same-origin: ${s}`);
  }
});
