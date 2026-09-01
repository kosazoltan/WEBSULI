/**
 * AUDIT 2026-09-01 — backup/restore tartalom-kapu.
 *
 * A `getAllHtmlFiles()` listanézet-optimalizált lekérdezés üres `content`-et ad vissza;
 * a backup-készítés korábban ezt használta, így a mentések tartalom nélkül készültek, a
 * visszaállítás pedig a teljes tananyag-állományt üres sorokkal írta felül. A restore
 * útvonalak ezért csak olyan snapshotot fogadhatnak el, amelyben MINDEN tananyagnak van
 * nem-üres tartalma. Tiszta függvény — egységtesztelhető DB nélkül.
 */
export interface BackupFileLike {
  id?: string | null;
  title?: string | null;
  content?: string | null;
}

export class EmptyBackupContentError extends Error {
  readonly emptyIds: string[];
  constructor(emptyIds: string[]) {
    super(
      `A backup ${emptyIds.length} tananyagot üres tartalommal tartalmaz — a visszaállítás ` +
        `megtagadva, hogy ne vesszen el az élő tartalom (első azonosítók: ${emptyIds.slice(0, 5).join(', ')})`,
    );
    this.name = 'EmptyBackupContentError';
    this.emptyIds = emptyIds;
  }
}

/** Azok az azonosítók, amelyekhez nem tartozik nem-üres string tartalom. */
export function findEmptyContentIds(files: readonly BackupFileLike[]): string[] {
  const empty: string[] = [];
  for (const f of files) {
    if (typeof f?.content !== 'string' || f.content.length === 0) {
      empty.push(String(f?.id ?? '?'));
    }
  }
  return empty;
}

/** Dob, ha bármelyik tananyag tartalma hiányzik vagy üres. Üres lista rendben van. */
export function assertBackupFilesHaveContent(files: readonly BackupFileLike[]): void {
  const empty = findEmptyContentIds(files);
  if (empty.length > 0) {
    throw new EmptyBackupContentError(empty);
  }
}
