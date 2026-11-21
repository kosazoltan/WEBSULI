import type { Request, RequestHandler } from "express";
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

/** R46: a lecke eredmény-POST útvonala a `/api/lessons` csatolási ponthoz képest (a router: `/:lessonId/results`). */
const RESULT_POST_PATH = /^\/[A-Za-z0-9_-]{1,64}\/results$/;
export const isResultPost = (req: Request) => req.method === "POST" && RESULT_POST_PATH.test(req.path);
/**
 * A `/api/lessons` alatti publikus írások közös kerete (a `server/index.ts` szereli fel a `publicWriteLimiter`-rel). A biztonságos
 * metódusok, a tanulónkénti keretű ismétlés (`/review/`, review #268) és a saját keretű eredmény-POST (R46) kimarad.
 */
export function lessonsWriteGate(limiter: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (req.path.startsWith("/review/")) return next();
    // Terv R46 (8. vak kör L5): a pontos eredmény-POST saját, egymástól független kerete (60 + 60 / 15 perc / IP, R9) érvényes — a közös
    // 100-as keret különben a 41. végleges beküldést (vagy fordított sorrendben a pillanatképet) elutasítaná. A CSRF-őr ettől változatlan.
    if (isResultPost(req)) return next();
    return limiter(req, res, next);
  };
}
