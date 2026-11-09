# Végrehajtás: a „Meghallgatás” szerveroldali hangtartaléka

> Spec: `docs/specs/2026-11-09-felolvasas-tartalek.md` · Ág: `fix/felolvasas-tartalek`

## T1 — `source/shared/speech-fallback.ts` (új, tiszta)
- `TTS_LANGS` (alapnyelvek), `ttsLang(language)`: az alapnyelv (en-GB → en), ha listán van; egyébként null.
- `ttsAudioUrl(text, language)` → `/api/tts/audio?text=…&lang=…` (URLSearchParams) vagy null.
- `parseTtsAudioQuery(query)` → `{ text, lang }` | `{ error }` (szöveg kötelező, trim, ≤ 300 karakter; nyelv `ttsLang` szerint).
- `isSoftSpeechError(code)`: `interrupted` | `canceled`.
- `hasVoiceFor(voices, language)`: üres lista → true (még tölt); különben van-e pontos vagy előtag-egyezés.
- `SPEECH_START_TIMEOUT_MS = 3000`.

## T2 — `source/server/routes.ts`
- `app.get("/api/tts/audio")` a `POST /api/tts` mellé: `parseTtsAudioQuery`, `getAllAudioBase64`, Buffer-összefűzés, `audio/mpeg`,
  `Cache-Control: public, max-age=86400`; hibára 400 / 500 JSON.

## T3 — `source/client/src/lesson-runtime/ExperienceSpeech.tsx`
- `speakText`: előző kimondás / hang leállítása (`cancel` csak `speaking || pending` esetén); `speechSynthesis` nélkül vagy
  `!hasVoiceFor` esetén azonnal tartalék; különben `onstart` / `onend` / `onerror` + 3 mp-es őr; puha hiba → semmi; más hiba / őr → tartalék.
- `playFallback`: `new Audio(ttsAudioUrl)`, `playbackRate = rate`, `play().catch` és `onerror` → `onError`.
- `SpeakButton`: `speechSynthesis` hiányában is gomb (a tartalék szól).

## T4 — Tesztek (új)
- `tests/speech-fallback.test.ts`: nyelvkód, URL, lekérdezés-ellenőrzés, puha hibák, hanglista.
- `tests/lesson-fusion.spec.ts` új tesztek: (a) `speak` → `onerror({error:"synthesis-failed"})` → a `HTMLMediaElement.play` a
  `/api/tts/audio?text=triangle&lang=en` címmel (a szolgáltatás csak alapnyelvet fogad el) hívódik, hibaüzenet nincs; (b) `interrupted` → nincs lejátszás, nincs üzenet;
  (c) `speechSynthesis` nélkül → tartalék lejátszás.

## T5 — Ellenőrzés, szállítás
- `check`, `lint`, `check:test`, `npm test`, `playwright -c playwright.lesson-fusion.config.ts`.
- PR, automatikus összevonás (tulajdonosi felhatalmazás 2026-11-09), Render + Vercel élesítés, élő `GET /api/tts/audio?text=slender&lang=en` → 200 `audio/mpeg`.
