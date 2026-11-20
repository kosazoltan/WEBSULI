import { RESULT_OUTBOX_KEY, roundTooOld } from "./quiz-round";

/**
 * Spec 2026-11-17-eredmeny-email-kviz — a végleges beküldések tartós kimenő sorának TÁROLÓRÉTEGE (R24, R28, R30, R32). Import nélküli
 * böngészős függőség: a tárolót a hívó adja (a kliens a `localStorage`-ot, a teszt modellezettet).
 * - R32 (review 4642333249): bejegyzésenként külön kulcs (`websuli:result-outbox:v1:<azonosító>`) — a felvétel és a törlés egyetlen kulcs
 *   írása / törlése, nincs közös lista olvasás-módosítás-írása, így két fül egyidejű írása nem veszít bejegyzést.
 * - R28: ha a tároló írása dob (kvóta) vagy a tároló el sem érhető (privát mód), a bejegyzés memóriában marad, és az olvasás onnan is adja.
 * - R30 (review 4642268402): minden bejegyzés a kör utolsó tevékenységének idejét viszi (`activityAt`); a 7 napnál régebbi lejárt.
 */
export type OutboxEntry = {
  id: string;
  lessonId: string;
  kind: "tasks" | "quiz";
  body: Record<string, unknown>;
  flag: string;
  partialKey: string;
  /** R30: lezárt körnél a sorba kerülés ideje, le nem zártnál a kör utolsó tevékenysége (ms). */
  activityAt: number;
  /** R31: a sorba kerüléskori kilét-címke (`null`: akkor még nem volt ismert). */
  subject?: string | null;
};
export type OutboxStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

const PREFIX = `${RESULT_OUTBOX_KEY}:`;
export const outboxKeyOf = (id: string) => `${PREFIX}${id}`;

export function isOutboxEntry(value: unknown): value is OutboxEntry {
  const e = value as Partial<OutboxEntry> | null;
  return !!e && typeof e.id === "string" && typeof e.lessonId === "string" && (e.kind === "tasks" || e.kind === "quiz")
    && typeof e.flag === "string" && typeof e.partialKey === "string" && !!e.body && typeof e.body === "object"
    && typeof e.activityAt === "number" && Number.isFinite(e.activityAt) && e.activityAt > 0
    && (e.subject === undefined || e.subject === null || typeof e.subject === "string");
}

/** R32: van-e függő bejegyzés a tárolóban (az alkalmazás induláskor ennek láttán tölti be a beküldőt). Sosem dob. */
export function hasPendingOutbox(storage: OutboxStorage | null): boolean {
  try {
    if (!storage) return false;
    for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(PREFIX)) return true;
  } catch { /* olvashatatlan tároló: nincs tartós sor */ }
  return false;
}

/** R30: a bejegyzés lejárt (a kör utolsó tevékenysége 7 napnál régebbi) — küldés nélkül kikerül a sorból. */
export const outboxEntryExpired = (entry: Pick<OutboxEntry, "activityAt">, now: number) => roundTooOld(entry.activityAt, now);

export function createOutboxStore(getStorage: () => OutboxStorage | null) {
  /** R28: a tárolóba nem írható bejegyzések (azonosító → bejegyzés). */
  const memory = new Map<string, OutboxEntry>();
  const storage = (): OutboxStorage | null => { try { return getStorage(); } catch { return null; } };
  function readStored(): OutboxEntry[] {
    const store = storage();
    if (!store) return [];
    const found: OutboxEntry[] = [];
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) { const key = store.key(i); if (key?.startsWith(PREFIX)) keys.push(key); }
      for (const key of keys) {
        try {
          const parsed: unknown = JSON.parse(store.getItem(key) ?? "null");
          if (isOutboxEntry(parsed) && outboxKeyOf(parsed.id) === key) found.push(parsed);
        } catch { /* sérült bejegyzés: nem bejegyzés */ }
      }
    } catch { /* olvashatatlan tároló: csak a memóriasor */ }
    return found;
  }
  function read(): OutboxEntry[] {
    const stored = readStored();
    return [...stored, ...[...memory.values()].filter(entry => !stored.some(e => e.id === entry.id))];
  }
  function write(entry: OutboxEntry): void {
    try {
      const store = storage();
      if (!store) throw new Error("no storage");
      store.setItem(outboxKeyOf(entry.id), JSON.stringify(entry));
      memory.delete(entry.id);
    } catch { memory.set(entry.id, entry); }
  }
  return {
    read,
    /** Felvétel; a már sorban álló azonosító nem kerül be másodszor (az első felvétel marad). */
    add(entry: OutboxEntry): void { if (!read().some(e => e.id === entry.id)) write(entry); },
    /** A bejegyzés módosított változatának visszaírása (pl. a kilét-címke pótlása, R31). */
    update(entry: OutboxEntry): void { write(entry); },
    remove(id: string): void {
      memory.delete(id);
      try { storage()?.removeItem(outboxKeyOf(id)); } catch { /* a memóriából már kikerült */ }
    },
  };
}
