import { sql } from "drizzle-orm";
import { TTS_AUDIO_ID } from "../../shared/tts-audio-key";
import { logger } from "../lib/logger";

/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8b (D4): az előre gyártott felolvasó hangok CSERÉLHETŐ tároló rétege. A végpont, a gyártó
 * (S8c) és a kiadás előtti kapu (SK4) csak a `TtsAudioStore` felületet használja; későbbi átköltöztetésnél (külső tárhely) új
 * megvalósítás kerül a `ttsAudioStore()` gyár mögé — a lecke, a kulcs és a kliens útvonala nem változik.
 */
export type TtsAudio = { mime: string; bytes: Buffer; size: number };
export type TtsAudioRow = TtsAudio & { id: string; voiceVersion: string; language: string };
export interface TtsAudioStore {
  get(id: string): Promise<TtsAudio | null>;
  /** A megadott kulcsok közül a tárban meglévők. */
  has(ids: readonly string[]): Promise<Set<string>>;
  /** Tartalomcímzett írás: meglévő kulcsot nem ír felül. Méretőr: plafon felett `TtsStorageLimitError`, írás nélkül. */
  put(row: TtsAudioRow): Promise<"stored" | "exists">;
  totalBytes(): Promise<number>;
}

/** Méretőr (Neon-keret): az összplafon felfelé csak kódváltozással (review-val) állítható. */
export const TTS_AUDIO_LIMITS = { maxTotalBytes: 40 * 1024 * 1024, maxFileBytes: 300 * 1024 } as const;
export const TTS_AUDIO_MIME = "audio/mpeg";
export type TtsAudioLimits = { maxTotalBytes: number; maxFileBytes: number };

/** A `TTS_AUDIO_MAX_TOTAL_BYTES` környezeti változó az összplafont csak LEFELÉ viheti; hibás vagy nagyobb érték hatástalan. */
export function ttsAudioLimits(envValue: string | undefined = process.env.TTS_AUDIO_MAX_TOTAL_BYTES): TtsAudioLimits {
  const wanted = envValue !== undefined && /^\d+$/.test(envValue.trim()) ? Number(envValue.trim()) : NaN;
  const maxTotalBytes = Number.isSafeInteger(wanted) && wanted < TTS_AUDIO_LIMITS.maxTotalBytes ? wanted : TTS_AUDIO_LIMITS.maxTotalBytes;
  return { maxTotalBytes, maxFileBytes: TTS_AUDIO_LIMITS.maxFileBytes };
}

export class TtsStorageLimitError extends Error {
  constructor(readonly reason: "file-too-large" | "total-exceeded", readonly detail: { size: number; totalBytes?: number; limit: number }) {
    super(reason === "file-too-large"
      ? `A hangfájl túl nagy (${detail.size} bájt; legfeljebb ${detail.limit}).`
      : `A hangtár betelt (${detail.totalBytes} + ${detail.size} bájt; plafon ${detail.limit}) — az írás megtagadva, a kiszolgálás megy tovább.`);
    this.name = "TtsStorageLimitError";
  }
}
export class TtsAudioInputError extends Error {
  constructor(message: string) { super(message); this.name = "TtsAudioInputError"; }
}

/** A sor formai ellenőrzése és a fájlméret-őr (tiszta; adatbázis nélkül tesztelhető). */
export function validateTtsAudioRow(row: TtsAudioRow, limits: TtsAudioLimits = ttsAudioLimits()): void {
  if (!TTS_AUDIO_ID.test(row.id)) throw new TtsAudioInputError("Érvénytelen hangkulcs (32 kisbetűs hexa jegy kell).");
  if (row.mime !== TTS_AUDIO_MIME) throw new TtsAudioInputError(`Csak ${TTS_AUDIO_MIME} hang tárolható.`);
  if (!Buffer.isBuffer(row.bytes) || row.bytes.length === 0) throw new TtsAudioInputError("Üres hang nem tárolható.");
  if (row.size !== row.bytes.length) throw new TtsAudioInputError("A megadott méret nem egyezik a bájtok hosszával.");
  if (!row.voiceVersion || row.voiceVersion.length > 16) throw new TtsAudioInputError("Érvénytelen hangverzió.");
  if (!row.language || row.language.length > 8) throw new TtsAudioInputError("Érvénytelen nyelvkód.");
  if (row.size > limits.maxFileBytes) throw new TtsStorageLimitError("file-too-large", { size: row.size, limit: limits.maxFileBytes });
}

/** Az összméret-őr (tiszta): az új fájllal együtt sem léphető át a plafon. */
export function assertTotalWithinLimit(totalBytes: number, size: number, limits: TtsAudioLimits): void {
  if (totalBytes + size > limits.maxTotalBytes) throw new TtsStorageLimitError("total-exceeded", { size, totalBytes, limit: limits.maxTotalBytes });
}

type Database = typeof import("../db").db;
/** Az írások sorba állítása (tranzakciós tanácsadó zár): két egyidejű írás együtt sem lépheti át a plafont. */
const TTS_AUDIO_LOCK_KEY = 7_320_311_18;

/** Adatbázisos megvalósítás (`lesson_tts_audio`, migrations/0042). */
export class DbTtsAudioStore implements TtsAudioStore {
  constructor(private readonly database: () => Promise<Database>, private readonly limits: () => TtsAudioLimits = ttsAudioLimits) {}

  async get(id: string): Promise<TtsAudio | null> {
    if (!TTS_AUDIO_ID.test(id)) return null;
    const db = await this.database();
    const { rows } = await db.execute(sql`SELECT mime, bytes, size FROM lesson_tts_audio WHERE id = ${id}`);
    const row = rows[0] as { mime?: unknown; bytes?: unknown; size?: unknown } | undefined;
    return row && typeof row.mime === "string" && Buffer.isBuffer(row.bytes) ? { mime: row.mime, bytes: row.bytes, size: Number(row.size) } : null;
  }

  async has(ids: readonly string[]): Promise<Set<string>> {
    const valid = Array.from(new Set(ids.filter((id) => TTS_AUDIO_ID.test(id))));
    const found = new Set<string>();
    if (!valid.length) return found;
    const db = await this.database();
    for (let start = 0; start < valid.length; start += 500) {
      const chunk = valid.slice(start, start + 500);
      const { rows } = await db.execute(sql`SELECT id FROM lesson_tts_audio WHERE id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})`);
      for (const row of rows as Array<{ id?: unknown }>) if (typeof row.id === "string") found.add(row.id);
    }
    return found;
  }

  async put(row: TtsAudioRow): Promise<"stored" | "exists"> {
    const limits = this.limits();
    try {
      validateTtsAudioRow(row, limits);
      const db = await this.database();
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${TTS_AUDIO_LOCK_KEY})`);
        const existing = await tx.execute(sql`SELECT 1 FROM lesson_tts_audio WHERE id = ${row.id}`);
        if (existing.rows.length) return "exists" as const;
        const total = await tx.execute(sql`SELECT COALESCE(SUM(size), 0)::bigint AS total FROM lesson_tts_audio`);
        assertTotalWithinLimit(Number((total.rows[0] as { total?: unknown } | undefined)?.total ?? 0), row.size, limits);
        await tx.execute(sql`INSERT INTO lesson_tts_audio (id, voice_version, language, mime, bytes, size)
          VALUES (${row.id}, ${row.voiceVersion}, ${row.language}, ${row.mime}, ${row.bytes}, ${row.size})`);
        return "stored" as const;
      });
    } catch (error) {
      // Jelzés: a megtagadott írás a naplóban is látszik (a kulcs nem személyes adat; a szöveg nincs a sorban).
      if (error instanceof TtsStorageLimitError) logger.warn(`[TTS-AUDIO] Írás megtagadva (${error.reason}): ${error.message}`);
      throw error;
    }
  }

  async totalBytes(): Promise<number> {
    const db = await this.database();
    const { rows } = await db.execute(sql`SELECT COALESCE(SUM(size), 0)::bigint AS total FROM lesson_tts_audio`);
    return Number((rows[0] as { total?: unknown } | undefined)?.total ?? 0);
  }
}

let selected: TtsAudioStore | undefined;
/** A tároló kiválasztása EGY helyen. Az adatbázis-kapcsolat csak az első tényleges híváskor töltődik be. */
export function ttsAudioStore(): TtsAudioStore {
  return (selected ??= new DbTtsAudioStore(async () => (await import("../db")).db));
}
