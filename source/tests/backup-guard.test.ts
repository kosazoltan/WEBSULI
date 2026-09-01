import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertBackupFilesHaveContent,
  EmptyBackupContentError,
  findEmptyContentIds,
} from "../server/lib/backup-guard";

/**
 * AUDIT 2026-09-01 — backup/restore tartalom-kapu.
 * A createBackup/exportBackupSnapshot korábban a listanézet-optimalizált getAllHtmlFiles()-t
 * használta (content: ''), így a restore a teljes tananyag-állományt üres sorokkal írta felül.
 */

test("findEmptyContentIds: csak az üres/hiányzó tartalmú fájlokat adja vissza", () => {
  const files = [
    { id: "a", title: "A", content: "<html>ok</html>" },
    { id: "b", title: "B", content: "" },
    { id: "c", title: "C", content: null },
    { id: "d", title: "D" },
  ];
  assert.deepEqual(findEmptyContentIds(files), ["b", "c", "d"]);
});

test("assertBackupFilesHaveContent: teljes tartalommal átmegy, üres listával is", () => {
  assert.doesNotThrow(() => assertBackupFilesHaveContent([{ id: "a", content: "x" }]));
  assert.doesNotThrow(() => assertBackupFilesHaveContent([]));
});

test("assertBackupFilesHaveContent: egyetlen üres content-ű fájl is megtagadja a restore-t", () => {
  assert.throws(
    () => assertBackupFilesHaveContent([{ id: "a", content: "x" }, { id: "b", content: "" }]),
    (err: unknown) => err instanceof EmptyBackupContentError && err.emptyIds.length === 1 && err.emptyIds[0] === "b",
  );
});

test("storage.ts: a backup-készítés nem a listanézet (üres content) lekérdezését használja", () => {
  const src = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "server", "storage.ts"), "utf8");
  const createBackupBody = src.slice(src.indexOf("async createBackup("), src.indexOf("async getAllBackups("));
  const exportBody = src.slice(src.indexOf("async exportBackupSnapshot("), src.indexOf("async importBackupSnapshot("));
  assert.ok(createBackupBody.length > 0 && exportBody.length > 0, "a két metódus megtalálható");
  assert.ok(!createBackupBody.includes("getAllHtmlFiles()"), "createBackup ne használja getAllHtmlFiles()-t");
  assert.ok(!exportBody.includes("getAllHtmlFiles()"), "exportBackupSnapshot ne használja getAllHtmlFiles()-t");
  assert.ok(createBackupBody.includes("from(htmlFiles)"), "createBackup teljes sorokat olvas");
  assert.ok(exportBody.includes("from(htmlFiles)"), "exportBackupSnapshot teljes sorokat olvas");
  // a restore útvonalak kapuja
  const restoreBody = src.slice(src.indexOf("async restoreBackup("), src.indexOf("async createMaterialView("));
  assert.ok(restoreBody.includes("assertBackupFilesHaveContent("), "restoreBackup kapuzva");
  const importBody = src.slice(src.indexOf("async importBackupSnapshot("));
  assert.ok(importBody.includes("assertBackupFilesHaveContent("), "importBackupSnapshot kapuzva");
});
