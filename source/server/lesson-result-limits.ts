import type { Request } from "express";
import rateLimit, { MemoryStore } from "express-rate-limit";
import { clientIpKeyGenerator } from "./lib/client-ip";

/**
 * Spec 2026-11-17-eredmeny-email-kviz, R9 — tulajdonosi döntés (kérdőív, 2026-11-18): „Egy osztályra méretezve”. Egy osztály közös IP
 * mögött (iskolai wifi) ül; kicsengetéskor ~30 pillanatkép és ~30 végleges beküldés érkezik egy címről. Mindkét keret 60 / 15 perc / IP,
 * egymástól függetlenül (a pillanatképek nem fogyasztják a végleges beküldés keretét). A kulcs a valódi kliens-IP (`clientIpKeyGenerator`).
 * Ár: a visszaélési plafon IP-nként 60 „félbehagyva” + 60 végleges levél / 15 perc (címzettenként). Adatbázis-import nélküli modul, hogy
 * egységtesztből közvetlenül mérhető legyen (`tests/lesson-result-limits.test.ts`).
 */
export const RESULT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, final: 60, partial: 60 } as const;

export const isPartialRequest = (req: Request) => (req.body as { partial?: unknown } | undefined)?.partial === true;

const message = { message: "Túl sok beküldés." };
export const resultLimiter = rateLimit({ keyGenerator: clientIpKeyGenerator, windowMs: RESULT_RATE_LIMIT.windowMs, limit: RESULT_RATE_LIMIT.final, standardHeaders: true, legacyHeaders: false, message,
  // S1b: a pillanatképek saját keretet kapnak — a végleges beküldés kerete nem fogyhat el miattuk.
  skip: isPartialRequest });

const partialLimiterStore = new MemoryStore();
/** Teszthez: a pillanatkép-keret számlálóinak nullázása (az integrációs tesztek egy címről sok pillanatképet küldenek). */
export function resetPartialLimiter(): void { void partialLimiterStore.resetAll(); }
export const partialLimiter = rateLimit({ store: partialLimiterStore, keyGenerator: clientIpKeyGenerator, windowMs: RESULT_RATE_LIMIT.windowMs, limit: RESULT_RATE_LIMIT.partial, standardHeaders: true, legacyHeaders: false, message,
  skip: req => !isPartialRequest(req) });
