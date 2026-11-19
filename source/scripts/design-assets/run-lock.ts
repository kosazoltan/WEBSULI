/**
 * Futás-zár a külön képkészletekhez (review L7): két egyidejű generálás ugyanarra a készletre nem indulhat, mert mindkettő a
 * napló induláskori összegéből számolná a keretet. A zár egy kizárólagosan létrehozott fájl a jelöltmappában.
 */
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import path from "node:path";

export function acquireRunLock(dir: string, now: Date = new Date()): () => void {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ".run.lock");
  let fd: number;
  try {
    fd = openSync(file, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let holder = "";
    try { holder = readFileSync(file, "utf8").trim(); } catch { holder = "ismeretlen"; }
    throw new Error(`Már fut egy generálás erre a készletre (${holder}). Ha biztosan nem fut, töröld a zárfájlt: ${file}`);
  }
  writeSync(fd, `pid ${process.pid}, indult: ${now.toISOString()}`);
  closeSync(fd);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    rmSync(file, { force: true });
  };
}
