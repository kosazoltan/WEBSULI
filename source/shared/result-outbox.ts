import { roundTooOld } from "./quiz-round";

/**
 * B7 (docs/specs/2026-11-25-eredmeny-email-b7.md; a #510 tárolórétege, R28 / R30 / R32 — a főág kilét-modelljéhez szűkítve): a végleges
 * beküldések tartós kimenő sorának TÁROLÓRÉTEGE. Import nélküli böngészős függőség: a tárolót a hívó adja (a kliens a `localStorage`-ot
 * — kapcsoló mögött —, a teszt modellezettet).
 * - R32: bejegyzésenként külön kulcs — a felvétel és a törlés egyetlen kulcs írása / törlése, nincs közös lista olvasás-módosítás-írása,
 *   így két fül egyidejű írása nem veszít bejegyzést.
 * - R28: ha a tároló írása dob (kvóta) vagy a tároló el sem érhető (privát mód, KI kapcsoló), a bejegyzés memóriában marad.
 * - R30: minden bejegyzés a kör utolsó tevékenységének idejét viszi (`activityAt`); a 7 napnál régebbi lejárt.
 * - Kilét (B4b, R47 / R49 b): a kör rögzített párosítási LENYOMATA (`owner`), nem a token — küldéskor a mostani token csak egyezésnél megy.
 */
export const RESULT_OUTBOX_PREFIX = "websuli:result-outbox:v1:";
export type OutboxEntry = {
  id: string;
  lessonId: string;
  kind: "tasks" | "quiz";
  /** A kör törzse (kind, roundId, answers / picks) — ujjlenyomat és párosító token nélkül (azok a küldéskor kerülnek bele). */
  body: Record<string, unknown>;
  /** B1b: a kör kezdete / utolsó válasza (a szerver opcionális mezői). */
  times?: { startedAt?: number; lastAnsweredAt?: number };
  flag: string;
  partialKey: string;
  ownerKey: string;
  owner: { learnerTag: string | null };
  /** R30: lezárt körnél a sorba kerülés ideje, le nem zártnál a kör utolsó tevékenysége (ms). */
  activityAt: number;
};
export type OutboxStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

export const outboxKeyOf = (id: string) => `${RESULT_OUTBOX_PREFIX}${id}`;
const finiteTime = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v > 0);

export function isOutboxEntry(value: unknown): value is OutboxEntry {
  const e = value as Partial<OutboxEntry> | null;
  return !!e && typeof e === "object" && typeof e.id === "string" && typeof e.lessonId === "string" && (e.kind === "tasks" || e.kind === "quiz")
    && typeof e.flag === "string" && typeof e.partialKey === "string" && typeof e.ownerKey === "string"
    && !!e.body && typeof e.body === "object" && !Array.isArray(e.body)
    && !!e.owner && typeof e.owner === "object" && (e.owner.learnerTag === null || typeof e.owner.learnerTag === "string")
    && typeof e.activityAt === "number" && Number.isFinite(e.activityAt) && e.activityAt > 0
    && (e.times === undefined || (!!e.times && typeof e.times === "object" && finiteTime(e.times.startedAt) && finiteTime(e.times.lastAnsweredAt)));
}

/** R32: van-e függő bejegyzés a tárolóban (az alkalmazás induláskor ennek láttán üríti a sort). Sosem dob. */
export function hasPendingOutbox(storage: OutboxStorage | null): boolean {
  try {
    if (!storage) return false;
    for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(RESULT_OUTBOX_PREFIX)) return true;
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
      for (let i = 0; i < store.length; i++) { const key = store.key(i); if (key?.startsWith(RESULT_OUTBOX_PREFIX)) keys.push(key); }
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
  return {
    read,
    /** Felvétel; a már sorban álló azonosító nem kerül be másodszor (az első felvétel marad). Igaz, ha ÚJ bejegyzés jött létre. */
    add(entry: OutboxEntry): boolean {
      if (read().some(e => e.id === entry.id)) return false;
      try {
        const store = storage();
        if (!store) throw new Error("no storage");
        store.setItem(outboxKeyOf(entry.id), JSON.stringify(entry));
      } catch { memory.set(entry.id, entry); }
      return true;
    },
    remove(id: string): void {
      memory.delete(id);
      try { storage()?.removeItem(outboxKeyOf(id)); } catch { /* a memóriából már kikerült */ }
    },
  };
}
