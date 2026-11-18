import { sql } from "drizzle-orm";
import { TTS_AUDIO_AVAILABILITY_MAX_KEYS, TTS_AUDIO_ID, TTS_VOICE_VERSION } from "../../shared/tts-audio-key";
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
  /**
   * Elérhetőségi jegyzék: a megadott kulcsok közül a tárban meglévők, EGYETLEN lekérdezéssel (a hívó darabszám-plafont tart:
   * legfeljebb `TTS_AUDIO_AVAILABILITY_MAX_KEYS`; érvénytelen alakú kulcs és a plafon fölötti rész kimarad). Csak olvas.
   */
  existing(keys: readonly string[]): Promise<string[]>;
  /** A megadott kulcsok közül a tárban meglévők (tetszőleges darabszám, szeletekben — a gyártónak). */
  has(ids: readonly string[]): Promise<Set<string>>;
  /**
   * Tartalomcímzett írás: meglévő kulcsot nem ír felül. Csak az AKTUÁLIS hangverzióra (`TTS_VOICE_VERSION`) enged írni — más verziónév
   * nem nyithat új keretet. Két kemény méretőr együtt, mindkettő `TtsStorageLimitError`-ral, írás nélkül tagad meg:
   * (a) a hangverzió összmérete (`maxTotalBytes`), (b) a teljes tábla abszolút plafonja (`maxAbsoluteBytes` — egy hangcsere átmeneti
   * kettős készlete fér bele, több nem; utána takarítás kell). A kiszolgálás a plafonoktól függetlenül megy tovább.
   */
  put(row: TtsAudioRow): Promise<"stored" | "exists">;
  /** A tárolt bájtok összege: egy hangverzióé, vagy (paraméter nélkül) az egész táré. */
  totalBytes(voiceVersion?: string): Promise<number>;
  /** Mérőszám a gyártónak és az admin-nézetnek: a teljes tárolt méret és hangverziónkénti bontása. */
  usage(): Promise<TtsAudioUsage>;
  /**
   * Takarítás hangcsere után: a megadott verzión KÍVÜLI sorok törlése. Visszafordíthatatlan — csak tulajdonos által indított
   * szkript / admin-feladat hívja (S8c); a végpont és a gyártás soha. Megtagadja a futást, ha a megtartandó verzió nem az aktuális
   * (`TTS_VOICE_VERSION`), vagy ha annak egyetlen sora sincs (elgépelt név vagy még le nem gyártott új hang ne ürítse ki a tárat).
   */
  purgeOtherVersions(keepVoiceVersion: string): Promise<{ rows: number; bytes: number }>;
}
export type TtsAudioUsage = { totalBytes: number; rows: number; byVersion: Record<string, { rows: number; bytes: number }> };

/**
 * Méretőr (Neon-keret): hangverziónként 40 MB (`maxTotalBytes`), a teljes táblára abszolút 80 MB (`maxAbsoluteBytes` = 2 × 40 MB),
 * fájlonként 300 KB. Felfelé egyik sem állítható környezeti változóval — csak kódváltozással (review-val).
 */
export const TTS_AUDIO_LIMITS = { maxTotalBytes: 40 * 1024 * 1024, maxAbsoluteBytes: 80 * 1024 * 1024, maxFileBytes: 300 * 1024 } as const;
export const TTS_AUDIO_MIME = "audio/mpeg";
export type TtsAudioLimits = { maxTotalBytes: number; maxAbsoluteBytes: number; maxFileBytes: number };

/** A `TTS_AUDIO_MAX_TOTAL_BYTES` környezeti változó a verziónkénti plafont csak LEFELÉ viheti; hibás vagy nagyobb érték hatástalan. */
export function ttsAudioLimits(envValue: string | undefined = process.env.TTS_AUDIO_MAX_TOTAL_BYTES): TtsAudioLimits {
  const wanted = envValue !== undefined && /^\d+$/.test(envValue.trim()) ? Number(envValue.trim()) : NaN;
  const maxTotalBytes = Number.isSafeInteger(wanted) && wanted < TTS_AUDIO_LIMITS.maxTotalBytes ? wanted : TTS_AUDIO_LIMITS.maxTotalBytes;
  return { maxTotalBytes, maxAbsoluteBytes: TTS_AUDIO_LIMITS.maxAbsoluteBytes, maxFileBytes: TTS_AUDIO_LIMITS.maxFileBytes };
}

export class TtsStorageLimitError extends Error {
  constructor(readonly reason: "file-too-large" | "total-exceeded" | "absolute-exceeded", readonly detail: { size: number; totalBytes?: number; limit: number }) {
    super(reason === "file-too-large"
      ? `A hangfájl túl nagy (${detail.size} bájt; legfeljebb ${detail.limit}).`
      : reason === "total-exceeded"
        ? `A hangverzió kerete betelt (${detail.totalBytes} + ${detail.size} bájt; plafon ${detail.limit}) — az írás megtagadva, a kiszolgálás megy tovább.`
        : `A teljes hangtár betelt (${detail.totalBytes} + ${detail.size} bájt; abszolút plafon ${detail.limit}) — az írás megtagadva; régi hangverziók takarítása kell.`);
    this.name = "TtsStorageLimitError";
  }
}
export class TtsAudioInputError extends Error {
  constructor(message: string) { super(message); this.name = "TtsAudioInputError"; }
}

/** A sor formai ellenőrzése és a fájlméret-őr (tiszta; adatbázis nélkül tesztelhető). */
export function validateTtsAudioRow(row: TtsAudioRow, limits: TtsAudioLimits = ttsAudioLimits(), currentVersion: string = TTS_VOICE_VERSION): void {
  if (!TTS_AUDIO_ID.test(row.id)) throw new TtsAudioInputError("Érvénytelen hangkulcs (32 kisbetűs hexa jegy kell).");
  if (row.mime !== TTS_AUDIO_MIME) throw new TtsAudioInputError(`Csak ${TTS_AUDIO_MIME} hang tárolható.`);
  if (!Buffer.isBuffer(row.bytes) || row.bytes.length === 0) throw new TtsAudioInputError("Üres hang nem tárolható.");
  if (row.size !== row.bytes.length) throw new TtsAudioInputError("A megadott méret nem egyezik a bájtok hosszával.");
  if (!row.voiceVersion || row.voiceVersion.length > 16) throw new TtsAudioInputError("Érvénytelen hangverzió.");
  if (row.voiceVersion !== currentVersion) throw new TtsAudioInputError(`Írni csak az aktuális hangverzióra (${currentVersion}) lehet.`);
  if (!row.language || row.language.length > 8) throw new TtsAudioInputError("Érvénytelen nyelvkód.");
  if (row.size > limits.maxFileBytes) throw new TtsStorageLimitError("file-too-large", { size: row.size, limit: limits.maxFileBytes });
}

/** Az összméret-őr (tiszta): az új fájllal együtt sem a hangverzió kerete, sem a teljes tábla abszolút plafonja nem léphető át. */
export function assertTotalWithinLimit(stored: { versionBytes: number; totalBytes: number }, size: number, limits: TtsAudioLimits): void {
  if (stored.versionBytes + size > limits.maxTotalBytes) throw new TtsStorageLimitError("total-exceeded", { size, totalBytes: stored.versionBytes, limit: limits.maxTotalBytes });
  if (stored.totalBytes + size > limits.maxAbsoluteBytes) throw new TtsStorageLimitError("absolute-exceeded", { size, totalBytes: stored.totalBytes, limit: limits.maxAbsoluteBytes });
}

type Database = typeof import("../db").db;
/** Az írások sorba állítása (tranzakciós tanácsadó zár): két egyidejű írás együtt sem lépheti át a plafont. */
export const TTS_AUDIO_LOCK_KEY = 7_320_311_18;

/** Adatbázisos megvalósítás (`lesson_tts_audio`, migrations/0043). */
export class DbTtsAudioStore implements TtsAudioStore {
  private readonly limits: () => TtsAudioLimits;
  private readonly currentVersion: string;
  private readonly warn: (message: string) => void;
  /** A beállítások csak teszthez térnek el az alapértéktől (kisebb plafon, próba-hangverzió, a naplójelzés megfigyelése). */
  constructor(private readonly database: () => Promise<Database>, options: { limits?: () => TtsAudioLimits; currentVersion?: string; warn?: (message: string) => void } = {}) {
    this.limits = options.limits ?? ttsAudioLimits;
    this.currentVersion = options.currentVersion ?? TTS_VOICE_VERSION;
    this.warn = options.warn ?? ((message) => logger.warn(message));
  }

  async get(id: string): Promise<TtsAudio | null> {
    if (!TTS_AUDIO_ID.test(id)) return null;
    const db = await this.database();
    const { rows } = await db.execute(sql`SELECT mime, bytes, size FROM lesson_tts_audio WHERE id = ${id}`);
    const row = rows[0] as { mime?: unknown; bytes?: unknown; size?: unknown } | undefined;
    return row && typeof row.mime === "string" && Buffer.isBuffer(row.bytes) ? { mime: row.mime, bytes: row.bytes, size: Number(row.size) } : null;
  }

  async existing(keys: readonly string[]): Promise<string[]> {
    const valid = Array.from(new Set(keys.filter((id) => TTS_AUDIO_ID.test(id)))).slice(0, TTS_AUDIO_AVAILABILITY_MAX_KEYS);
    if (!valid.length) return [];
    const db = await this.database();
    const { rows } = await db.execute(sql`SELECT id FROM lesson_tts_audio WHERE id IN (${sql.join(valid.map((id) => sql`${id}`), sql`, `)}) ORDER BY id`);
    return (rows as Array<{ id?: unknown }>).flatMap((row) => typeof row.id === "string" ? [row.id] : []);
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
      validateTtsAudioRow(row, limits, this.currentVersion);
      const db = await this.database();
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${TTS_AUDIO_LOCK_KEY})`);
        const existing = await tx.execute(sql`SELECT 1 FROM lesson_tts_audio WHERE id = ${row.id}`);
        if (existing.rows.length) return "exists" as const;
        const total = await tx.execute(sql`SELECT COALESCE(SUM(size) FILTER (WHERE voice_version = ${row.voiceVersion}), 0)::bigint AS version_total,
          COALESCE(SUM(size), 0)::bigint AS total FROM lesson_tts_audio`);
        const sums = total.rows[0] as { version_total?: unknown; total?: unknown } | undefined;
        assertTotalWithinLimit({ versionBytes: Number(sums?.version_total ?? 0), totalBytes: Number(sums?.total ?? 0) }, row.size, limits);
        await tx.execute(sql`INSERT INTO lesson_tts_audio (id, voice_version, language, mime, bytes, size)
          VALUES (${row.id}, ${row.voiceVersion}, ${row.language}, ${row.mime}, ${row.bytes}, ${row.size})`);
        return "stored" as const;
      });
    } catch (error) {
      // Jelzés: a megtagadott írás a naplóban is látszik (a kulcs nem személyes adat; a szöveg nincs a sorban).
      if (error instanceof TtsStorageLimitError) this.warn(`[TTS-AUDIO] Írás megtagadva (${error.reason}): ${error.message}`);
      throw error;
    }
  }

  async totalBytes(voiceVersion?: string): Promise<number> {
    const db = await this.database();
    const { rows } = voiceVersion === undefined
      ? await db.execute(sql`SELECT COALESCE(SUM(size), 0)::bigint AS total FROM lesson_tts_audio`)
      : await db.execute(sql`SELECT COALESCE(SUM(size), 0)::bigint AS total FROM lesson_tts_audio WHERE voice_version = ${voiceVersion}`);
    return Number((rows[0] as { total?: unknown } | undefined)?.total ?? 0);
  }

  async usage(): Promise<TtsAudioUsage> {
    const db = await this.database();
    const { rows } = await db.execute(sql`SELECT voice_version, count(*)::int AS rows, COALESCE(SUM(size), 0)::bigint AS bytes
      FROM lesson_tts_audio GROUP BY voice_version ORDER BY voice_version`);
    const usage: TtsAudioUsage = { totalBytes: 0, rows: 0, byVersion: {} };
    for (const row of rows as Array<{ voice_version?: unknown; rows?: unknown; bytes?: unknown }>) {
      const entry = { rows: Number(row.rows), bytes: Number(row.bytes) };
      usage.byVersion[String(row.voice_version)] = entry;
      usage.totalBytes += entry.bytes;
      usage.rows += entry.rows;
    }
    return usage;
  }

  async purgeOtherVersions(keepVoiceVersion: string): Promise<{ rows: number; bytes: number }> {
    // Üres, alakilag hibás vagy nem az aktuális „megtartandó” verzióval a hívás az élő hangokat törölné — a bemenet ellenőrzése kizárja.
    if (!/^[a-z0-9][a-z0-9.-]{0,15}$/.test(keepVoiceVersion)) throw new TtsAudioInputError("Érvénytelen hangverzió.");
    if (keepVoiceVersion !== this.currentVersion) throw new TtsAudioInputError(`Takarításnál csak az aktuális hangverzió (${this.currentVersion}) tartható meg.`);
    const db = await this.database();
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${TTS_AUDIO_LOCK_KEY})`);
      // A zár alatt: ha a megtartandó verzióból még semmi nincs legyártva, a takarítás az egész tárat kiürítené.
      const kept = await tx.execute(sql`SELECT 1 FROM lesson_tts_audio WHERE voice_version = ${keepVoiceVersion} LIMIT 1`);
      if (!kept.rows.length) throw new TtsAudioInputError(`A megtartandó hangverziónak (${keepVoiceVersion}) nincs sora — a takarítás megtagadva.`);
      const { rows } = await tx.execute(sql`DELETE FROM lesson_tts_audio WHERE voice_version <> ${keepVoiceVersion} RETURNING size`);
      const purged = { rows: rows.length, bytes: (rows as Array<{ size?: unknown }>).reduce((sum, row) => sum + Number(row.size), 0) };
      this.warn(`[TTS-AUDIO] Takarítás: ${purged.rows} régi hangverziójú sor törölve (${purged.bytes} bájt); megtartva: ${keepVoiceVersion}.`);
      return purged;
    });
  }
}

let selected: TtsAudioStore | undefined;
/** A tároló kiválasztása EGY helyen. Az adatbázis-kapcsolat csak az első tényleges híváskor töltődik be. */
export function ttsAudioStore(): TtsAudioStore {
  return (selected ??= new DbTtsAudioStore(async () => (await import("../db")).db));
}
