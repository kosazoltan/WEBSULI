import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { isTtsAudioSubPath } from "../../shared/speech-fallback";
import { isTtsLessonAudioSubPath, LESSON_AUDIO_RATE_LIMIT, TTS_AUDIO_ROUTE } from "../../shared/tts-audio-key";
import { clientIpKeyGenerator } from "../lib/client-ip";

/**
 * A felolvasás három, egymástól FÜGGETLEN sebességkorlátja egy helyen, a bekötéssel együtt — így a bekötést valódi HTTP-teszt méri
 * (terv 2026-11-18-tananyag-gyartas-minoseg S8d; vak review K4). Minden korlát kulcsa a valódi kliens címe (spec 2026-11-10-korlat-kliens-ip).
 *  - `general`: a nyilvános felolvasó proxy (`/api/tts`) — nélküle a szerver ingyenes, korlátlan Google TTS átjáró lenne;
 *  - `fallback`: a „Meghallgatás” szerveres tartaléka (`/api/tts/audio`; spec 2026-11-09-felolvasas-tartalek) — bővebb keret;
 *  - `lessonAudio`: a hangtár (előre gyártott hangfájl + elérhetőségi jegyzék), osztályra méretezve (`LESSON_AUDIO_RATE_LIMIT`).
 */
export const TTS_RATE_LIMITS = {
  general: { windowMs: 15 * 60 * 1000, max: 60 },
  fallback: { windowMs: 15 * 60 * 1000, max: 600 },
  lessonAudio: { windowMs: LESSON_AUDIO_RATE_LIMIT.windowMs, max: LESSON_AUDIO_RATE_LIMIT.max },
} as const;

const MESSAGE = "Túl sok felolvasási kérés. Próbáld újra később!";

export function mountTtsRateLimits(app: Express): void {
  const generalLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator, ...TTS_RATE_LIMITS.general, message: MESSAGE, standardHeaders: true, legacyHeaders: false,
    // A szerveres tartaléknak és a hangtárnak saját korlátja van: ezek az utak az általános (szűk) keretet nem fogyasztják.
    skip: (req) => isTtsAudioSubPath(req.path) || isTtsLessonAudioSubPath(req.path),
  });
  const fallbackLimiter = rateLimit({ keyGenerator: clientIpKeyGenerator, ...TTS_RATE_LIMITS.fallback, message: MESSAGE, standardHeaders: true, legacyHeaders: false });
  const lessonAudioLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator, ...TTS_RATE_LIMITS.lessonAudio, message: MESSAGE, standardHeaders: true, legacyHeaders: false,
    // A hangtár útjain a Vercel nem tesz `no-store`-t (a tartós gyorsítótár kivétele miatt): a 429 kifejezetten nem tárolható.
    handler: (_req, res, _next, options) => { res.status(options.statusCode).set("Cache-Control", "no-store").send(options.message); },
  });
  app.use("/api/tts", generalLimiter);
  app.use("/api/tts/audio", fallbackLimiter);
  app.use(TTS_AUDIO_ROUTE, lessonAudioLimiter);
}
