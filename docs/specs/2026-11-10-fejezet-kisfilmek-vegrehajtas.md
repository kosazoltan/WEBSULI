# Végrehajtási utasítás: fejezetenkénti kisfilmek

> Terv: `docs/specs/2026-11-10-fejezet-kisfilmek.md` · Minden útvonal a `source/` alatt értendő, hacsak nem `docs/`-szal kezdődik.
> Ág: `ccr-a3f44bec-3j46cv`. Parancsok a `source/` mappából. Sorrend kötött; minden feladat után a megadott ellenőrzés fut.

## S1 — adatszerződés, tábla, kiszolgálás, lejátszó, kézi kisfilmek

### T1 · `shared/lesson-clip.ts` (új)

Exportok:
- `CLIP_LIMITS = { say: 240, sayMin: 20, totalSay: 900, scenesMin: 3, scenesMax: 8 }`.
- `clipSchema`, `clipSceneSchema`, `clipVisualSchema` (zod, minden objektum `.strict()`), típusok `Clip`, `ClipScene`, `ClipVisual`
  a terv 4.1 pontja szerint; a `clipSchema` `superRefine`-ja a `say` összhosszt (≤ 900) ellenőrzi.
- `clipSource(lesson: Pick<Lesson,"sections">, sectionIndex: number): string | null` — terv 4.3; `isGoalCardText` a
  `shared/lesson-block-label.ts`-ből; < 80 karakternél `null`.
- `clipSourceHash(source: string): string` — sha256 hex. A fájl a kliensre is bekerül, ezért a hash NEM itt, hanem a
  `server/lesson-clips.ts`-ben él (`node:crypto`); a `shared` fájl csak tiszta, böngészőben is futó kódot tartalmaz.
- `clipContentProblems(clip: Clip, source: string, heading: string): string[]` — terv 4.7 (első jelenet `title`; számhűség:
  `/\d+(?:[.,]\d+)?/g`, a vessző és a pont egyenértékű; tiltott jelek: `<`, `>`, `**`, `` ` ``, `http`).
- `clipTexts(clip): string[]` — minden `say` és képernyőszöveg (a kapukhoz és a teszthez).
- `silentSceneMs(say: string): number` = `Math.max(2500, say.length * 65)`.
- `type LessonClipsResponse = { clips: Array<{ sectionIndex: number; clip: Clip }>; pending: boolean }`.

Ellenőrzés: `tests/lesson-clip.test.ts` (új) — `node --import tsx --test tests/lesson-clip.test.ts` → minden teszt `pass`.

### T2 · tábla

- `migrations/0038_lesson_clips.sql` (új): `SET LOCAL lock_timeout = '5s';` + `CREATE TABLE IF NOT EXISTS lesson_clips (…)`
  a terv 4.2 oszlopaival, `CHECK (status IN ('ready','failed'))`, `CHECK (origin IN ('handmade','auto'))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS lesson_clips_section_unique ON lesson_clips(lesson_id, section_index);`
  A fejlécben a visszaállítás módja. Utasításhatár: `--> statement-breakpoint` (a `0037_task_results.sql` mintájára).
- `shared/schema.ts`: `export const lessonClips = pgTable("lesson_clips", …)` ugyanezekkel az oszlopokkal, a `lessons`
  tábla definíciója UTÁN.
- A migráció ↔ Drizzle-séma egyezését a `tests/lesson-clip.test.ts` utolsó tesztje méri (külön fájl helyett).

Ellenőrzés: `node --import tsx --test tests/lesson-clip.test.ts` → `pass`; `npm run check` → 0 hiba.

### T3 · `server/lesson-clip-seeds.ts` (új) — a kézi kisfilmek

`export const CLIP_SEEDS: Record<string, Array<{ sectionIndex: number; heading: string; clip: Clip }>>` — a
`1f04037f-bb51-4929-940e-366337ec04b8` lecke mind a 12 fejezetéhez (index 0–11) egy-egy kisfilm, fejezetenként 4–5 jelenet,
a `say` összhossz fejezetenként ≤ 560 karakter (fejezetenként kb. fél perc). A `heading` a 2026-11-10-én élesből letöltött
lecke fejezetcíme, betűre azonosan. Tartalom: csak a lecke állításai és számai.

Ellenőrzés: a `tests/lesson-clip.test.ts` kézi-kisfilm tesztje → `pass` (séma, 12 fejezet, összhossz, első jelenet `title`).

### T4 · `server/lesson-clips.ts` (új) — tár, kézi beírás, kiszolgálási szűrő (a gyártás az S2-ben)

- `clipsMode(env)`: `"off"` (`LESSON_CLIPS === "0"`), `"auto"` (`LESSON_CLIPS_AUTO === "on"` és van `OPENROUTER_API_KEY`), különben `"seeds"`.
- `type ClipRow = { lessonId; sectionIndex; heading; sourceHash: string | null; status: "ready" | "failed"; clip: unknown; origin: "handmade" | "auto"; attempts: number }`.
- `type ClipStore` (élesben `dbClipStore`, tesztben memóriabeli): `lesson(id)` → `{ id, publishedAt, json } | null`;
  `freshLessons(sinceIso)`; `rows(lessonId)`; `upsertHandmade(row)`; `upsertAuto(row)` (kézi sort nem ír felül: az
  `ON CONFLICT … DO UPDATE … WHERE lesson_clips.origin = 'auto'`); `autoLessonsToday()`; `exclusive(work)` (advisory lock, kulcs `7_320_311_10`).
- `servableClips(lessonJson, rows): Array<{ sectionIndex; clip }>` — terv 4.4 szűrője (tiszta függvény).
- `eligibleSections(lessonJson): Array<{ sectionIndex; heading; source; hash }>`.
- `clipsPending(mode, publishedAt, lessonJson, rows, now)`: terv 4.4.
- `seedHandmade(store, seeds = CLIP_SEEDS): Promise<number>` — E7.

### T5 · végpont

`server/studio/lesson-routes.ts`: `lessonPublicRouter.get("/:id/clips", …)` a `/:id/material` ELŐTT nem szükséges (külön
útvonal); a `server/lesson-clips.ts` függvényeit hívja; a válasz `LessonClipsResponse`. `LESSON_CLIPS=0`: üres válasz, DB-olvasás nélkül.

Ellenőrzés: a `tests/lesson-clip-worker.test.ts` kiszolgálási esetei → `pass`; `npm run check`.

### T6 · lejátszó

- `client/src/lesson-runtime/clips/clip-scenes.tsx` (új): `ClipStage({ scene, speaking, sceneKey })` — a hat képsablon és a
  narrátor-kabala inline SVG-vel; osztálynevek `clip-*`.
- `client/src/lesson-runtime/clips/lesson-clips.css` (új): színpad, kulcskockák, `@media (prefers-reduced-motion: reduce)` alatt
  minden `clip-*` animáció kikapcsolva; a színek a lecke CSS-változóiból (`--lesson-*`) tartalékértékkel.
- `client/src/lesson-runtime/clips/ClipPlayer.tsx` (új): `ClipPlayer({ playlist, onClose })`, `playlist: Array<{ sectionIndex, heading, clip }>`;
  hanglánc a terv 4.8 szerint; `data-testid`: `clip-player`, `clip-caption`, `clip-scene-dot`, `clip-toggle`, `clip-next`, `clip-prev`, `clip-close`;
  a gyökéren `data-scene`, `data-chapter`, `data-audio` (`mp3` | `speech` | `silent`).
- `client/src/lesson-runtime/clips/useLessonClips.ts` (új): `useLessonClips(lessonId, preset?)` → `{ clips: Map<number, Clip>, pending }`.
- `client/src/lesson-runtime/clips/ClipContext.tsx` (új): `ClipProvider` (állapot + a megnyitott lejátszó), `useClips()`;
  `ClipChapterButton({ sectionIndex })`, `ClipPlayAllButton()`.
- `client/src/lesson-runtime/LessonRuntime.tsx`: a `LessonRuntime` törzse `ClipProvider`-be kerül (`lessonId`, fejezetcímek);
  a `LessonSection` `<h2>`-jében a `SectionMascot` elé `<ClipChapterButton sectionIndex={sectionIdx} />`.
- `client/src/lesson-runtime/LessonExperienceView.tsx`: a `learning-book-head` sor végére `<ClipPlayAllButton />`.
- `client/src/lesson-runtime/LessonRuntimeProbe.tsx`: `?clips=1` → a fúziós próbalecke + beépített próba-kisfilmek
  (`clipsPreset` prop a `LessonRuntime`-on át a `ClipProvider`-nek; a próbaoldalon nincs `lessonId`). `?clips=pending` → `pending` jelzés.

Ellenőrzés: `npm run check`, `npm run lint`; `tests/lesson-clips.spec.ts` + `playwright.lesson-clips.config.ts` (a
`playwright.lesson-fusion.config.ts` mintájára) → `npx playwright test -c playwright.lesson-clips.config.ts --trace off` → minden teszt `passed`;
képernyőképek a scratchpadbe, szemrevételezve (átfedés, levágás, görgetősáv).

### T7 · S1 commit

`git add` csak a fenti fájlok + a két spec; commit: `feat(lecke): fejezetenkénti rajzfilmes kisfilmek — lejátszó, tábla, kézi próba a Dinamika-leckén (S1)`.

## S2 — háttérgyártás

### T8 · `server/lesson-clips.ts` bővítése

- `CLIP_TEXT_MODEL = "anthropic/claude-haiku-5.5"`, `CLIP_FRESH_DAYS = 3`, `CLIP_MAX_ATTEMPTS = 2`, `CLIP_PARALLEL = 3`.
- `CLIP_SYSTEM` prompt: a séma leírása, a hat képsablon mikor való, magyar, tegező, az évfolyamhoz illő mondatok; csak a
  kapott fejezetszöveg állításai és számai; 4–6 jelenet; az első `title`; JSON-on kívül semmi.
- `type ClipDeps = { chat(system: string, user: string): Promise<string> }`; `openRouterClipDeps(key)` (a borító
  `openRouterDeps` mintájára; a kulcs csak fejlécben).
- `makeClip(input: { title, subject, classroom, heading, source }, deps): Promise<{ clip: Clip } | { problems: string[] }>` —
  egy hívás + egy javító hívás.
- `runClipRound(store, deps | null, mode, opts: { dailyLimit, now }): Promise<{ seeded, made, failed, lessons }>` — zár alatt:
  `seedHandmade`; `auto` módban a friss leckék (legfrissebb elöl) → jogosult fejezetek, amelyeknek nincs `ready` sora azonos
  lenyomattal, nincs kézi sora, és `attempts < 2` (eltérő lenyomatnál az `attempts` újraindul) → gyártás 3-as párhuzamossággal;
  napi plafon leckénként.
- `clipDailyLimit(env)`, `startLessonClipWorker(store, env): ClipMode` (90 mp / 3 perc, `unref()` — külön leállító nem kell, ahogy a
  leckeborító-munkásnál sincs). Az éles tár külön fájl: `server/lesson-clips-db.ts` (`dbClipStore`), hogy a logika adatbázis nélkül tesztelhető legyen.

### T9 · indítás

`server/index.ts`: a leckeborító-munkás indítása után, ugyanazzal a feltétellel (`production`, nem e2e) a kisfilm-munkás;
az időzítők `unref()`-eltek, a leállítást nem tartják fel.

### T10 · tesztek, dokumentáció

- `tests/lesson-clip-worker.test.ts` (új): terv 7. pontja.
- `docs/fejezet-kisfilmek-hasznalat.md` (új): mit lát a tanuló, kapcsolók, élesítés lépései, visszavonás, hogyan írható kézi kisfilm.
- `render.yaml`: nem változik (a kapcsolók a Render felületén állnak, ahogy a `STUDIO_LESSON_OPENER`; a doksi rögzíti).
- `docs/agent-csapdak.md`: a munka közben mért csapdák.

Ellenőrzés: `npm run check` → 0 hiba; `npm run lint` → 0 hiba; `npm test` → 0 `fail`; `npm run build` → sikeres;
Playwright kisfilm-spec → `passed`; a meglévő `playwright.lesson-fusion.config.ts` → `passed` (regresszió).

### T11 · S2 commit, push, PR

Commit: `feat(lecke): a kisfilmek háttérgyártása a közzététel után, kapcsolóval (S2)`. `git push -u origin ccr-a3f44bec-3j46cv`;
vázlat PR a `main`-re; a PR-leírásban: S1–S2, tesztkimenetek, élesítési teendők.

## Élesítés utáni teendő (a telepítés után, nem a PR része)

1. Telepítés után ≤ 5 perccel: `GET https://websuli.vip/api/lessons/1f04037f-bb51-4929-940e-366337ec04b8/clips` → 12 kisfilm.
2. A lecke megnyitása böngészőben: gombok, lejátszás, hang.
3. Tulajdonosi döntés után: `LESSON_CLIPS_AUTO=on` a Render `websuli-api-eu` szolgáltatáson; a következő új lecke kisfilmjeinek mérése.
