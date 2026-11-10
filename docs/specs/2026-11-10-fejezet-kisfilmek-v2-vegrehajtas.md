# Végrehajtási utasítás: fejezet-kisfilmek v2 — P0 (próba két korosztályon)

> Terv: `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md`. Útvonalak a `source/` alatt, hacsak nem `docs/`-szal kezdődnek.
> Ez a fájl a P0-t írja le. A P1 (tárolás, kiszolgálás) és a P2 (háttérgyártás) a P0 tulajdonosi szemléje után, a szemle
> döntéseivel (szolgáltató, képszám, hang) kiegészítve kap saját végrehajtási utasítást — addig éles adat nem íródik.

## T1 · `shared/clip-style.ts` (új) — korosztályos profil

`CLIP_BAND_STYLE: Record<DesignThemeId, ClipBandStyle>` a terv 4. táblázata szerint, mezők:
`imageStyle` (angol), `cast` (angol, szó szerint a képbriefbe; `null` ahol nincs figura), `imageRules` (közös tiltások + sávszabály),
`narration: { scenes: [min, max], sayMax, rules: string[] }` (magyar szabályok a forgatókönyvírónak),
`voice: { id, instructions, speed }`, `look: { radius, stroke, panel, ink, accent, accent2, font: "rounded" | "clean" }`.
`clipBandFor(classroom)` = `CLIP_BAND_STYLE[designThemeForClassroom(classroom)]`. `clipImagePrompt(brief, band)` = brief + cast + stílus + tiltások.

Ellenőrzés: `tests/clip-style.test.ts` (új) — mind az öt sáv megvan; 6. évfolyamtól `cast === null`; a `sayMax` sávonként nő;
a képprompt tartalmazza a tiltásokat és (ahol van) a figura leírását.

## T2 · `shared/lesson-clip.ts` — v2 séma

`clip2Schema` (strict) a terv 5. pontja szerint + `superRefine`: a jelenet `shot` indexe létező beállítás; a `say` ≤ a sáv
`sayMax` értéke; `graph` pontjai x szerint nőnek. `clipMediaUrl(id)` = `/api/lesson-clips/media/<id>`. `anyClipSchema` = v1 | v2.
A `LessonClipsResponse.clips[].clip` típusa `Clip | Clip2`. `clipTexts` és `clipContentProblems` a v2-re is (`clip2Texts`).

Ellenőrzés: a `tests/lesson-clip.test.ts` új v2 tesztjei (érvényes minta, hibás `shot` index, sáv feletti mondathossz, csökkenő x).

## T3 · lejátszó v2

- `client/src/lesson-runtime/clips/narrate.ts` (új): a `ClipPlayer.tsx` `narrate` függvénye ide költözik, a hang URL-jét paraméterként kapja.
- `clips/clip2-overlays.tsx` (új): `ClipOverlay({ overlay, ms, section })` — title, formula, steps, compare, graph (SVG, kirajzolódó
  vonal), vectors (SVG test + nyilak), lessonVisual (`ANIMATE_REGISTRY` a fejezet blokkjával, fehér panelen).
- `clips/Clip2Player.tsx` (új): kétrétegű kép áttűnéssel, kameramozgás a jelenet idejére, ábrapanel, felirat-kapcsoló
  (`data-testid="clip-cc"`), a v1 vezérlői és `data-*` jelzői; `data-clip-band` a sávval; a `look` CSS-változóként.
- `clips/lesson-clips2.css` (új).
- `clips/ClipContext.tsx`, `clips/useLessonClips.ts`: a lejátszási lista eleme `Clip | Clip2`; `v` szerint választ lejátszót;
  a `ClipProvider` megkapja a `sections`-t (a `lessonVisual`-hoz).
- `LessonRuntimeProbe.tsx`: `?clips2=1` → `/tmp/lesson-clips2.json` (a teszt / a bemutató szolgálja ki) előre beállított kisfilmként.

Ellenőrzés: `tests/lesson-clips.spec.ts` új v2 tesztjei (mindkét sáv mintája: elrendezés 1280 / 390 px túlcsordulás nélkül, a
jelenet a hang végén vált, felirat-kapcsoló, néma tartalék); a v1 tesztek változatlanul zöldek.

## T4 · a két kézi próba (a scratchpadben, nem a repóban)

1. Forgatókönyv kézzel, a sávprofil szabályai szerint: „Felszínformák” 4. o. 1. fejezet (adventure), „Dinamika” 9. o. 1. fejezet (laboratory).
2. Képek: beállításonként `clipImagePrompt` → képmodell (16:9, webp). Szemrevételezés: szöveg a képen, figura egyezése, stílus.
3. Hang: jelenetenként a sáv `voice` beállításával; a hossz `ffprobe`-bal → `ms`.
4. Bemutató felvétel mindkettőről (a v1 felvevő szkriptjének mintájára), képernyőképek; mért darabár és gyártási idő.

Ehhez kép- és hang-API kulcs kell (a munkamenet hálózati titkaként, nem a repóban, nem a chatben).

## T5 · kapuk, commit

`npm run check`, `npm run lint`, `npm run check:test`, `npm test`, `npm run build`, a kisfilm- és a `lesson-fusion` böngészőteszt.
Commit sorrend: terv + végrehajtási utasítás, utána kód. A push a tulajdonos engedélyére vár (ld. a v1 zárójelentése).
