# Végrehajtási utasítás: fejezet-kisfilmek v2 — P1 (tárolás, kiszolgálás, a v1 kivezetése) és P2 (háttérgyártás)

> Terv: `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md` (a 9b–9c mérésekkel). Útvonalak a `source/` alatt.
> Tulajdonosi szemle (2026-11-10): „a lányhang, a videók és a tartalom tökéletes”; a férfihang helyett **Csaba**; utasítás: a hang- és
> videógyártás megépítése. A két meg nem válaszolt kérdésre a jóváhagyott próba az alap (alább D1–D2), egy helyen átírható.

## Rögzített döntések

- **D1 · minden jelenet mozog** (ahogy a jóváhagyott próbában); ha a mozgókép nem készül el, a jelenet a kezdőképpel megy (lassú kameramozgás).
- **D2 · hang:** ElevenLabs `eleven_flash_v2_5`; 1–5. évfolyam „Vera” (`xjlfQQ3ynqiEyRpArrT8`), 6–12. évfolyam és 0 „Csaba” (`TCjj4QxGBFJeq0ODYm1f`).
- **D3 · mozgókép:** OpenRouter `bytedance/seedance-1-5-pro`, kezdőképből, 720p, hang nélkül, hossza a jelenet hangjához igazítva (4–12 mp).
- **D4 · kezdőkép:** a jóváhagyott próba képmodellje (OpenAI `gpt-image-2.5-flare`, `1280x720`), ha a szerveren van OpenAI-kulcs
  (`OPENAI_API_KEY` vagy `AI_INTEGRATIONS_OPENAI_API_KEY`); különben a leckeborító képmodellje az OpenRouteren (`COVER_IMAGE_MODEL`).
  Minden kép a borító minőségkapuján megy át (szöveg / nem biztonságos / nem a jelenet → egy újrapróba).
- **D5 · minden korosztály rajzfilmszerű:** a `laboratory` és a `future` sáv képstílusa stilizált 2D (nem fotó).
- **D6 · méret (mérve: egy Seedance-klip 5,7–17 MB):** nyers klip nem tárolható. A szerver `ffmpeg`-gel 960×540-es, kb. 700 kbit/s-os
  H.264-re kódolja át (hang nélkül, `+faststart`). Az `ffmpeg` helye: `FFMPEG_PATH`, különben a PATH. Ha nincs `ffmpeg`, vagy az átkódolt
  klip 2,5 MB-nál nagyobb, a jelenet mozgókép nélkül készül el (naplózva). npm-függőség NEM kerül be (ARM64 + x64 szabály).
  A hang `mp3_22050_32`, a kép `sharp`-pal 1280×720-as WebP.
- **D7 · tárkeret:** a `lesson_clip_media` tábla összmérete legfeljebb `LESSON_CLIP_MEDIA_MAX_MB` (alap 400 MB); fölötte a gyártás megáll
  (naplózva). Napi plafon: `LESSON_CLIP_DAILY_LIMIT` (alap 2 lecke). Az automatikus gyártás továbbra is csak `LESSON_CLIPS_AUTO=on` mellett fut.
- **D8 · a v1 kivezetése:** a v1 séma, lejátszó, képsablonok, kézi kisfilmek és a v1 gyártás törlődik; a végpont csak `v: 2` kisfilmet ad ki
  (egy korábban tárolt v1 sor nem megy ki). A `lesson_clips` tábla marad.

## P1

### T1 · `shared/clip-style.ts`
A `voice` mező: `{ id, model: "eleven_flash_v2_5" }` a D2 szerint; a `laboratory` / `future` `imageStyle` és `imageRule` a D5 szerint;
`narration.totalMax` (a kisfilm összes elmondott karaktere: explorer 270, adventure 420, studio 480, laboratory 480, future 480).
Teszt: `tests/clip-style.test.ts` igazítva (két hang, stilizált stílus a nagyoknál, `totalMax`).

### T2 · `shared/lesson-clip.ts`
A v1 (`clipSchema`, `clipVisualSchema`, `clipTexts`, `clipContentProblems`, `parseAnyClip`) törlődik; marad `CLIP_LIMITS`, `clipSource`,
`silentSceneMs`, a v2 séma. Új: `clipDraftSchema` (a forgatókönyvíró kimenete: `title`, `scenes[{ say, image, motion, alt, overlay? }]`,
3–4 jelenet), `clipDraftProblems(draft, band, source, heading, animateIndexes)` (sáv szerinti `sayMax` / `totalMax`, számhűség,
tiltott jelek, `lessonVisual` index, angol `image` / `motion` ≥ 20 karakter). A `Clip2.shots` jelenetenként egy kép; `superRefine`: `totalMax`.

### T3 · média — tábla, tár, végpont
- `migrations/0039_lesson_clip_media.sql`: `lesson_clip_media (id char(32) PK, kind varchar(8) CHECK image|audio|video, mime varchar(40),
  bytes bytea NOT NULL, size integer NOT NULL, created_at timestamptz DEFAULT now())`. Drizzle: `lessonClipMedia`.
- `server/lesson-clip-media.ts`: `mediaId(bytes)`, `registerLessonClipMedia(app)` → `GET /api/lesson-clips/media/:id`
  (`^[a-f0-9]{32}$`, különben 404; `Cache-Control: public, max-age=31536000, immutable`, `CDN-Cache-Control` ugyanez; `Accept-Ranges`,
  tartománykérés a `parseAudioRange`-dzsel; kis memóriatár a `TtsAudioCache`-sel, 48 MB).
- `server/routes.ts`: a regisztráció a `/api/lessons` útvonalak mellett. `vercel.json`: a no-store szabály kivétele és a rewrite-gyorsítótár
  a `lesson-clips/media/` útvonalra (a `tts/audio` mintájára). Kéréskorlát: a meglévő általános szabályok.
- Tesztek: `tests/lesson-clip-media.test.ts` (azonosító, 404 hibás azonosítóra, tartomány, fejlécek — a kezelő tiszta függvényén),
  migráció ↔ Drizzle.

### T4 · a v1 kivezetése a kliensben
Törlendő: `clips/ClipPlayer.tsx`, `clips/clip-scenes.tsx`, a `lesson-clips.css` v1 színpad-szabályai (a gombok, az átfedő réteg, a
vezérlők maradnak), `server/lesson-clip-seeds.ts`, a próbaoldal `?clips=1` v1 mintái. `ClipContext.tsx` / `useLessonClips.ts` csak v2.
A próbaoldal `?clips2=1` marad; a v1 böngészőtesztek (E1–E6) a v2 mintára íródnak át, az elvárások változatlanok.

## P2

### T5 · `server/lesson-clips.ts` — gyártósor (adatbázis és hálózat nélküli mag, függőségek befecskendezve)
`type ClipDeps = { chat(system, user): Promise<string>; image(prompt): Promise<{ bytes, mime }>; check(image, scene): Promise<{ ok, note }>;
speech(text, voice): Promise<Buffer> | null; video(image, prompt, seconds): Promise<Buffer>; shrink(video): Promise<Buffer | null>;
audioMs(bytes): number }` — a `speech` és a `video` hiányozhat (nincs kulcs): a kisfilm akkor is elkészül (tartalék hang, állókép).
`makeChapterClip(input, band, deps, putMedia)`: forgatókönyv (+ egy javítókör) → jelenetenként párhuzamosan: kép (+ kapu, egy újrapróba) →
hang → mozgókép (+ átkódolás) → `Clip2`. Egy jelenet mozgóképének hibája nem buktatja a kisfilmet; kép nélkül a kisfilm sikertelen.
`runClipRound`: friss leckék (3 nap), napi plafon, tárkeret (D7), fejezetenként `makeChapterClip`, egyszerre 2 fejezet; `failed` sor és
`attempts` a v1 szabálya szerint. `clipsMode`: `auto` csak `LESSON_CLIPS_AUTO=on` + `OPENROUTER_API_KEY` mellett.
- `server/lesson-clips-providers.ts`: a valódi függőségek — OpenRouter chat / kép / videó (`POST /api/v1/videos`, lekérdezés, letöltés;
  a kezdőkép beágyazott `data:` URL), OpenAI kép, ElevenLabs hang (`xi-api-key`, `ELEVENLABS_API_KEY`), `ffmpeg` átkódolás
  (`execFile`, 60 mp időkorlát), MP3-hossz a keretfejlécből. A kulcs soha nem kerül naplóba.
- `server/lesson-clips-db.ts`: `putMedia`, `mediaBytes()` (összméret), a meglévő tárműveletek.

### T6 · tesztek
`tests/lesson-clip-worker.test.ts` átírva a v2 gyártósorra hamis függőségekkel: teljes kisfilm; javítókör; képkapu-újrapróba; mozgókép
hibája → állóképes jelenet; hang nélkül (nincs kulcs) → `audio` nélküli jelenet; tárkeret és napi plafon; kiszolgálás csak v2-re;
megváltozott fejezet. Böngésző: `tests/lesson-clips.spec.ts` (v2, alap és saját konfigurációval is).

### T7 · élő próba (a munkamenet kulcsaival, éles adat írása nélkül)
`scripts/tananyag/clip-trial.ts`: egy letöltött lecke egy fejezetére lefuttatja a VALÓDI gyártósort (valódi szolgáltatók, memóriabeli
tár), kiírja a kisfilmet és a médiát egy mappába, méri az időt, a költséget és a méreteket. Futtatás a Dinamika 2. fejezetére; az
eredmény a terv 9d pontjába kerül, a kisfilm felvétele a tulajdonoshoz.

### T8 · dokumentáció, kapuk, commit, push
`docs/fejezet-kisfilmek-hasznalat.md` átírva a v2-re (kapcsolók: `LESSON_CLIPS_AUTO`, `LESSON_CLIP_DAILY_LIMIT`, `LESSON_CLIP_MEDIA_MAX_MB`,
`ELEVENLABS_API_KEY`, `FFMPEG_PATH`; élesítési lépések). Kapuk: lint, check, check:test, `npm test`, build, kisfilm-böngészőteszt mindkét
konfigurációval (helyi Postgres), `lesson-fusion` regresszió. Commit sorrend: ez a fájl → kód. Push a #417 ágára.

## Élesítés (tulajdonosi lépések, a PR összevonása után)

1. Render `websuli-api-eu` → Environment: `ELEVENLABS_API_KEY` (a kulcs), majd `LESSON_CLIPS_AUTO=on`.
2. Az első új lecke után a Render-naplóban: `[lesson-clips]` sorok (készült / sikertelen / `ffmpeg` hiánya / tárkeret).
3. Ha a napló szerint nincs `ffmpeg`: a kisfilmek állóképesek maradnak — ekkor szólni kell, és a mozgókép tárolását másképp oldjuk meg.
