/**
 * Induló mentés döntése (kanban #187, docs/specs/2026-10-18-autobackup-indulas.md).
 * Korábban minden szerverindulás után teljes mentés készült, akkor is, ha percekkel előtte már volt egy.
 */
export const STARTUP_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface BackupFileInfo {
  name: string;
  mtimeMs: number;
  /** false: truncated / empty file (review #308) — never counts as a fresh backup. */
  complete?: boolean;
}

/** A finished backup is pretty-printed JSON, so its last non-whitespace character is `}`. */
export function isCompleteBackupTail(tail: string): boolean {
  return tail.trimEnd().endsWith("}");
}

/** Igaz, ha `maxAgeMs`-en belül nem készült `backup_*.json` (a jövőbeli mtime frissnek számít). */
export function shouldBackupOnStartup(
  files: BackupFileInfo[],
  nowMs: number,
  maxAgeMs: number = STARTUP_BACKUP_MAX_AGE_MS,
): boolean {
  return !files.some(
    (f) =>
      f.complete !== false && f.name.startsWith("backup_") && f.name.endsWith(".json") && nowMs - f.mtimeMs < maxAgeMs,
  );
}

/**
 * Spec 2026-10-19-eroforras-s2b: a Renderen (RENDER=true) nincs tartós lemez — minden indulás üres `backups` mappával kezd, így a
 * 24 órás őr sosem véd, és minden kitelepítés teljes adatbázis-exportot olvasott (~12 MB), amely a következő kitelepítéskor elveszett.
 * Ott az induló mentés kimarad; a napi ütemezett és az eseményalapú mentés változatlan.
 */
export function startupBackupDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.RENDER === "true";
}
