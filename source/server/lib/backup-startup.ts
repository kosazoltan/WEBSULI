/**
 * Induló mentés döntése (kanban #187, docs/specs/2026-10-18-autobackup-indulas.md).
 * Korábban minden szerverindulás után teljes mentés készült, akkor is, ha percekkel előtte már volt egy.
 */
export const STARTUP_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface BackupFileInfo {
  name: string;
  mtimeMs: number;
}

/** Igaz, ha `maxAgeMs`-en belül nem készült `backup_*.json` (a jövőbeli mtime frissnek számít). */
export function shouldBackupOnStartup(
  files: BackupFileInfo[],
  nowMs: number,
  maxAgeMs: number = STARTUP_BACKUP_MAX_AGE_MS,
): boolean {
  return !files.some(
    (f) => f.name.startsWith("backup_") && f.name.endsWith(".json") && nowMs - f.mtimeMs < maxAgeMs,
  );
}
