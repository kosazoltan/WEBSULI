import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isCompleteBackupTail, shouldBackupOnStartup, STARTUP_BACKUP_MAX_AGE_MS } from "../server/lib/backup-startup";

/** Kanban #187 — docs/specs/2026-10-18-autobackup-indulas.md */
const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

test("üres könyvtár → induló mentés kell", () => {
  assert.equal(shouldBackupOnStartup([], NOW), true);
});

test("csak 25 órás mentés → induló mentés kell", () => {
  assert.equal(shouldBackupOnStartup([{ name: "backup_old_scheduled.json", mtimeMs: NOW - 25 * HOUR }], NOW), true);
});

test("1 órás mentés → nincs induló mentés", () => {
  assert.equal(shouldBackupOnStartup([{ name: "backup_x_event.json", mtimeMs: NOW - HOUR }], NOW), false);
});

test("friss, de nem mentés-fájl nem számít", () => {
  assert.equal(
    shouldBackupOnStartup(
      [
        { name: ".gitkeep", mtimeMs: NOW - HOUR },
        { name: "backup_x.json.tmp", mtimeMs: NOW - HOUR },
        { name: "notes.json", mtimeMs: NOW - HOUR },
      ],
      NOW,
    ),
    true,
  );
});

test("jövőbeli mtime frissnek számít", () => {
  assert.equal(shouldBackupOnStartup([{ name: "backup_future.json", mtimeMs: NOW + HOUR }], NOW), false);
});

test("egyedi maxAgeMs és alapérték", () => {
  const files = [{ name: "backup_a.json", mtimeMs: NOW - 2 * HOUR }];
  assert.equal(shouldBackupOnStartup(files, NOW, HOUR), true);
  assert.equal(shouldBackupOnStartup(files, NOW), false);
  assert.equal(STARTUP_BACKUP_MAX_AGE_MS, 24 * HOUR);
});

test("autoBackup.ts: a döntést használja, a cron budapesti időben fut", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "server", "autoBackup.ts"), "utf8");
  assert.match(src, /shouldBackupOnStartup\(/);
  assert.match(src, /timezone: 'Europe\/Budapest'/);
});

test("review #308: friss, de csonka mentés mellett elindul az induló mentés", () => {
  assert.equal(shouldBackupOnStartup([{ name: "backup_cut.json", mtimeMs: NOW - HOUR, complete: false }], NOW), true);
  assert.equal(shouldBackupOnStartup([{ name: "backup_ok.json", mtimeMs: NOW - HOUR, complete: true }], NOW), false);
});

test("review #308: a befejezett mentés vége `}`, a csonkáé nem", () => {
  assert.equal(isCompleteBackupTail(['  "x": 1', "  }", "}", ""].join("\n")), true);
  assert.equal(isCompleteBackupTail(['{', '  "data": {', '    "htmlFiles": [', '      {"id": "a", "conte'].join("\n")), false);
  assert.equal(isCompleteBackupTail(""), false);
});

test("review #308: a mentés ideiglenes fájlba íródik, és sikeres írás után nevezzük át", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "server", "autoBackup.ts"), "utf8");
  assert.match(src, /writeFile\(tmpPath,/);
  assert.match(src, /fs\.rename\(tmpPath, filepath\)/);
  assert.match(src, /complete: await hasCompleteBackupTail\(/);
});
