# Spec: Tananyag Készítő v7.4 skill beépítése a HTML-tananyagkészítésbe

> Dátum: 2026-09-09 · Szerző: Claude Code · Állapot: JÓVÁHAGYVA (tulajdonosi kérés: „Implementáld ezt a szkilt is a tananyagkészítés folyamatába”)
> Forrás: `docs/specs/tananyag-keszito-SKILL-v7_4.md` (a tulajdonos Downloads-mappájából másolva)
> Végrehajtás: `docs/specs/2026-09-09-tananyag-keszito-v74-integracio-vegrehajtas.md`

## 1. Cél

Minden HTML-tananyagot gyártó AI-út ugyanazt a v7.4-es specifikációt kövesse: háromrétegű szöveges kiértékelő motor (required/bonus/minWords/needsSentence/sample, ✅/🟡/❌), idegen nyelvnél kötelező TTS + szószedet, opcionális diktálás, Android-biztos magyar ékezetkezelés (Google Fonts `latin-ext`, bővített fallback-lánc, glyph-warmup, charset-meta), ES5/IIFE/prefix/44px szabályok — ÉS változatos megjelenés (téma, betűpár, fejléc-stílus) a tantárgy és korosztály szerint.

## 2. NEM cél

- A Studio JSON-lecke pipeline (`lesson-schema`, one-step) átírása — az nem HTML-t gyárt.
- A skill „build workflow” része (Python-szkriptek, `/mnt/user-data/outputs`, `present_files`) — az app-ban a HTML az `html_files` táblába megy.
- UTF-8 BOM a mentett tartalomban (a platform HTTP-n, `charset=utf-8` fejléccel szolgálja ki; a BOM az offline-fájl esetre szól).
- A DB-ben tárolt egyedi `material_creator` / `html_fixer` promptok törlése — azok személyiség/hangnem; a spec rájuk épül.

## 3. Ellenőrzött tények (kódból, 2026-09-09)

- HTML-t gyártó promptok: `server/routes.ts:1676` (`/api/admin/material-creator/chat`, DB-felülírással — a kliens ma NEM hívja), `server/routes.ts:2349` (`/api/ai/enhanced-creator/claude-chat`, az Enhanced készítő), `server/improveAsync.ts:33` (Okosítás), `server/studio/web-research-agent.ts` (webes ügynök).
- A DB `system_prompts.material_creator` AKTÍV (655 kar., 2025-11-02) és teljesen felülírja a route beépített v7.1-szabályait.
- A régi promptok TILTJÁK a Google Fontsot és `Segoe UI, system-ui`-t írnak elő — a v7.4 ennek ellenkezőjét követeli (Android ő/ű hiba). A CSP (`server/index.ts:123`, `lib/csp-profiles.ts`) engedi a `fonts.googleapis.com` / `fonts.gstatic.com` forrást.
- A Preview iframe `allow="microphone"`-t ad (`client/src/pages/Preview.tsx:226`) — a diktálás működhet.
- `server/improve/verify-html.ts` determinisztikus kapu (teljes dokumentum, JS parse, onclick-export, alert-tilalom) — újrahasznosítható a webes ügynök kimenetére.

## 4. Döntések

- Egy közös modul: `server/ai/lesson-html-spec.ts` — `LESSON_HTML_SPEC_V74` (a skill app-ra szabott, teljes követelményszövege a referencia-kódokkal), `pickLessonTheme(seed, classroom, subjectHint)` determinisztikus, de változatos téma-választó (8 téma: paletta + Google-betűpár + fejléc-stílus + prefix-javaslat), `lessonThemePrompt(theme)` és `lessonHtmlSpecPrompt(opts)` összeállító.
- Minden HTML-gyártó prompt: saját preambulum (szerep, beszélgetés, HTML_START) + `lessonHtmlSpecPrompt(...)`. A DB-s egyedi prompt mellé is hozzáfűződik (a spec a technikai szerződés, a DB-prompt a hangnem).
- A webes ügynök a kész HTML-t `verifyImprovedHtml`-lel ellenőrzi; a problémákat `warnings`-ként küldi, a panel megjeleníti.
- A téma seedje: cím + első üzenet/téma (webes ügynök), cím + metadata (Enhanced), fájlcím (Okosítás) — így ugyanaz a téma ugyanazt a kinézetet kapja, más téma mást.

## 5. Edge case-ek

- Idegen nyelvi téma felismerése: a modell dolga (prompt), de a téma-választó a nyelvi tantárgyhoz nyelvi témát ad.
- 0. osztály (programozás) → 7–8. évfolyamos szint + „űr/labor” téma.
- Google Fonts letiltva a hálózaton → a fallback-lánc (Noto Sans/Roboto/Droid Sans) tartja az ékezeteket.
- A verifier álpozitívja → csak figyelmeztetés, a mentés nem blokkolt (admin dönt).

## 6. Elfogadás (EARS)

- WHEN bármelyik HTML-gyártó prompt összeáll THEN it SHALL tartalmazni a `LESSON_HTML_SPEC_V74` szöveget (statikus teszt mind a 4 helyre), és NEM tartalmazhatja a „SOHA … Google Fonts” / „system-ui” előírást.
- WHEN a spec-szöveg készül THEN it SHALL tartalmazni: `ee_evaluate` referencia-motort, `required/bonus/minWords/needsSentence/sample` formátumot, `data-tts` TTS-szabályt, `subset=latin,latin-ext`, glyph-warmup elemet, `SpeechRecognition` diktálási szabályokat, a 45/15 és 75/25 mennyiségeket.
- WHEN két különböző seed érkezik THEN `pickLessonTheme` SHALL (a 8 témából) legalább 3 különbözőt adni 12 seedre, ugyanarra a seedre ugyanazt.
- WHEN a webes ügynök HTML-je nem megy át a verifieren THEN the system SHALL `warnings`-t küldeni és a panel megjeleníti.
- WHEN valós Opus 5 hívással készül egy tananyag az új spec-kel THEN a HTML SHALL: `latin-ext` fonts-linket, glyph-warmupot, `ee_evaluate`-et tartalmazni, `alert` nélkül, a Feladatok fülön a `sample` mintaválasz ✅-t adjon (fejnélküli Chrome-ban futtatva).

## 7. Tesztterv

- Unit: `tests/lesson-html-spec.test.ts` (spec-tartalom, téma-választó, statikus prompt-őrök a 4 fájlra, régi tiltás eltűnt).
- Meglévő: `tests/web-research-agent.test.ts` (LESSON_HTML_REQUIREMENTS alias marad).
- Valós API: egy teljes generálás + headless Chrome önteszt (skill „VALIDÁLÁSI ELVÁRÁS”).

## 8. Kockázat

- Hosszabb system prompt (~7 ezer token) → minden hívás drágább; Anthropic prompt-cache `cache_control` a system blokkon csökkenti (ismételt hívásoknál).
- A modell nem mindig tartja az ES5-öt; a verifier csak szintaxist néz. Elfogadott.

## 9. Végrehajtás állapota (2026-09-09)

- Kész: `server/ai/lesson-html-spec.ts` (spec + 8 téma + determinisztikus választó), bekötve: `routes.ts` (material-creator/chat DB-prompt mellé is; enhanced-creator/claude-chat), `improveAsync.ts`, `studio/web-research-agent.ts` + route (verifier `warnings`, system-blokk `cache_control`), `WebResearchAgentPanel.tsx` (figyelmeztető doboz).
- Mellékjavítás: az Enhanced készítő claude-chat route-ján a 60 s-os abszolút korlát → 120 s tétlenségi + 15 perc plafon; `max_tokens` 16 384 → 32 000 (a v7.1-es mérés is 17,3K tokent adott).
- Ellenőrzés: `tsc` 0 hiba, eslint 0 warning, 1039/1039 egységteszt zöld (új: `tests/lesson-html-spec.test.ts`, 10 eset).

## 10. Valós próba az új spec-kel (2026-09-09, 20:18–20:25, Opus 5 low, web_search)

- 1. futás 32 000 tokenes plafonnal: `max_tokens` stop, csonka (46 feladat + motor + TTS kész, a kvízbank elején szakadt). → plafon 64 000, kemény időkorlát 20 perc, KIMENET-TAKARÉKOSSÁG szakasz a specben.
- 2. futás (64K): `end_turn`, 382 s, **34 105 kimeneti token**, 2 keresés, prompt-cache olvasás 12 400 token, `verifyImprovedHtml` OK.
- Headless-Chrome önteszt (skill „VALIDÁLÁSI ELVÁRÁS”): Google Fonts latin-ext ✓, glyph-warmup ✓, charset meták + lang ✓, system-ui/Segoe sehol ✓, fallback-lánc ✓ (computed: Nunito → Noto Sans → Roboto…), `ee_evaluate` motor ✓, 45 feladat-objektum 45 mintaválasszal ✓, 65 `data-tts` elem + SpeechSynthesis ✓, nincs alert/details/arrow ✓, IIFE ✓, 74 kvízkérdés-találat (75 várt, 1 formázási eltérés), **15/15 látható feladat a saját `sample`-jével 100%** („Eredmény: 15 / 15 pont”), 0 túlcsordulás, 0 JS-hiba. Téma: Naplemente (angol nyelvi lecke) — látványosan más, mint a törtes (Tenger) anyag.
- Következmény: egy teljes v7.4-es tananyag ~6–7 perc és ~34K kimeneti token; a kliens státuszsora és a 20 perces plafon ezt lefedi.
