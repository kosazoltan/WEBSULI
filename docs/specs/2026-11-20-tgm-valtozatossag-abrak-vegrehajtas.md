# Végrehajtási utasítás — változatos tananyag és szebb ábrák (TGM változatossági lánc)

Terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` (a továbbiakban: terv). Alapterv: `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md`,
alap-végrehajtás: `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` (TGM-végrehajtás). Kódútvonal a `source/` alatt, ha nem
`docs/` kezdetű; a parancsok a `source/` mappából futnak.

Sorrend (terv 6. szakasz): **S5a → S5b → S6a → S6b → S2b → S6c → SK2**, utána a TGM-lánc a pótlási terv 7.6 szerint (S3a, S3b, …).
Egy szelet = egy ág (`feat/tgm-<szelet>-…`) = egy munkafa (`D:/repo/WEBSULI/.claude/worktrees/tgm-<szelet>`) = egy PR, friss
`origin/main`-ről (a függő szeletnél az előző szelet ágáról, halmozott láncként; minden PR önállóan semleges).

## 0. Közös szabályok

A TGM-végrehajtás 0.1–0.6 szakasza érvényes, a következő eltérésekkel / kiegészítésekkel:

1. **Kapcsoló:** minden változatossági viselkedés a `lessonVarietyEnabled()` (`server/studio/lesson-variety-flag.ts`) mögött áll; a motor
   és a builder egyszer dönt, teszt a `env` paraméterrel vagy a függvény befecskendezésével. KI állapotban a
   `tests/source-visuals-flag.test.ts` lenyomatai ZÖLDEK maradnak (a lenyomatot nem frissítjük).
2. **Push / PR nem az ügynöké:** a szelet végén a végleges fej hash-ét jelented az orkesztrátornak; a vak ellenőrzést ő indítja.
3. **Nehéz kör (gate:stage, teljes `npm test`, böngészős kör, gate:push, gate:pr) csak a gépi zárral** (a zár nevét — `tgm-<szelet>` —
   az orkesztrátor írja a sorrendfájlba). Célzott egységteszt zár nélkül futhat:
   `node --import tsx --test <tesztfájlok>`.
4. Fizetős hívás nincs (terv 8. szakasz).

## S5a — Kódszótári visszajelzés-nyitás és a változatossági kapcsoló

Ág: `feat/tgm-s5a-visszajelzes-nyitasok`. Munkafa: `.claude/worktrees/tgm-s5a`.

Fájlok: `shared/seeded.ts` (új), `shared/option-order.ts` (csak a kiemelt segédfüggvények importja),
`shared/lesson-feedback-openers.ts` (új), `shared/lesson-schema.ts` (`variety` jelölő, a modell-sémából kizárva),
`shared/lesson-opener.ts`, `server/studio/lesson-variety-flag.ts` (új), `server/studio/step-io.ts`,
`server/studio/experience-builder.ts`, `server/studio/pipeline-store.ts`, `client/src/lesson-runtime/VerdictFeedback.tsx`,
`client/src/lesson-runtime/LessonRuntime.tsx`, `client/src/lesson-runtime/LessonExperienceView.tsx`; tesztek:
`tests/seeded.test.ts`, `tests/lesson-feedback-openers.test.ts`, `tests/lesson-variety-flag.test.ts` (újak),
`tests/lesson-opener.test.ts` (bővül).

1. **Bukó tesztek ELŐBB** (a modulok még nem léteznek → `ERR_MODULE_NOT_FOUND` / assert-bukás):
   - `tests/seeded.test.ts`: `seedFrom("abc")` rögzített érték (FNV-1a: egyezik a `shared/option-order.ts` régi `hash32`-jével);
     `seededShuffle` permutáció és determinisztikus; `seededPick` üres listán `undefined`.
   - `tests/lesson-feedback-openers.test.ts`: sávonként ≥ 24 hibás- és ≥ 12 helyes-nyitás; mind ≤ 40 karakter, egyedi; egy kezdőszó a
     készlet legfeljebb 15%-a; 200 különböző kulcson a leggyakoribb nyitás aránya < 10% (mindhárom sávban, mindkét fajtára);
     determinizmus; a régi nyitások („Jó próba, de…”, „Szép próbálkozás!”, „Ügyes gondolat, de…”, „Pontosan!”, „Így van,”, „Helyes,”)
     levágódnak, a maradék nagybetűvel kezdődik; 12 karakternél rövidebb maradéknál az eredeti marad; tartalmi kezdetű mondat
     („Jó, hogy a négyzet…”) NEM vágódik; `feedbackView` jelöletlen leckén a mai `stripVerdictPrefix` kimenetét adja.
   - `tests/lesson-variety-flag.test.ts`: alapérték KI (hiány, üres, `off`, `1`); `on` / ` ON ` → BE; KI állapotban a
     `playfulAuthorRules(false)` és `playfulQuestioningContract(false)` bájtra a régi konstans; BE állapotban nincs „Jó próba” és
     „bátorító”, a verzió `nyitomese-2`; a `withVarietyMarker` KI állapotban a modell `variety` kulcsát is törli, BE állapotban beírja.
   - `tests/lesson-opener.test.ts`: a meglévő elvárások változatlanok (KI = régi szöveg).
2. `shared/seeded.ts`: `seedFrom(text): number` (FNV-1a 32 bit), `mulberry32(seed)`, `seededPick(items, seed)`,
   `seededShuffle(items, seed)` (Fisher–Yates). A `shared/option-order.ts` a `hash32` / `mulberry32` helyett ezeket importálja (azonos
   algoritmus — a `tests/option-order.test.ts` és `tests/quiz-option-order.test.ts` változatlanul zöld).
3. `shared/lesson-feedback-openers.ts`: `FEEDBACK_OPENERS: Record<AgeBand, { wrong: readonly string[]; right: readonly string[] }>`
   (sávhoz illő hangnem: `kid` meleg, egyszerű; `teen` közvetlen, nem gyerekes; `senior` tárgyszerű); `feedbackOpener(kind, band, key)`;
   `stripLegacyOpener(text)`; `feedbackOpenerKey(mapId, question, options)` (`choiceSeed`-del); `feedbackView({ right, text, variety })`
   → `{ opener?: string; reason: string }` — jelöletlen leckén `{ reason: stripVerdictPrefix(text, right) }`.
4. `shared/lesson-schema.ts`: `variety: z.object({ version: z.string().trim().min(1).max(40) }).passthrough().optional().catch(undefined)`
   a `lessonSchema` gyökerén; a `modelLessonSchema` mindkét ága `.omit({ variety: true })` (a modell nem adhat jelölőt).
   `LESSON_VARIETY_VERSION = "valtozatossag-1"` a `shared/lesson-feedback-openers.ts`-ben.
5. `shared/lesson-opener.ts`: `PLAYFUL_AUTHOR_RULES` és `PLAYFUL_QUESTIONING_CONTRACT` változatlan konstans marad (KI); új
   `playfulAuthorRules(variety)`, `playfulQuestioningContract(variety)`, `lessonOpenerVersion(variety)` — BE-nél a 115. és 136. sor
   helyett: „Bátorító vagy megerősítő nyitást NE írj — azt a program adja. Rossz válasznál: mi tévesztett meg, mit kérdezett a kérdés,
   mi a helyes gondolatmenet. Helyes válasznál: röviden, miért jó.”, a fejlécekben `nyitomese-2`.
6. `server/studio/lesson-variety-flag.ts`: `lessonVarietyEnabled(env = process.env)` (`on`, kis-nagybetű és szóköz tűrő).
7. `server/studio/step-io.ts:553`: `PLAYFUL_AUTHOR_RULES` → `playfulAuthorRules(lessonVarietyEnabled())`.
   `server/studio/experience-builder.ts:39`, `:526`, `:553`, `:559`: a konstans / verzió helyett a kapcsolós függvények.
8. `server/studio/pipeline-store.ts` `upsertLesson`: `withVarietyMarker(input, lessonVarietyEnabled())` a `withLessonArt` ELŐTT
   (a segédfüggvény a `shared/lesson-feedback-openers.ts`-ben, tiszta).
9. Kliens: `VerdictFeedback` új opcionális `opener` propot kap (az ítélet után, félkövér nélkül, saját `lesson-verdict-opener`
   osztállyal); a hívók (`LessonRuntime.tsx` `CheckBlock`, `LessonExperienceView.tsx` kvíz) a `feedbackView`-t hívják a lecke
   `variety` jelölőjével, a sávval (`ageBandForClassroom(lesson.classroom)`) és a kulccsal. Jelöletlen leckén a DOM bájtra a régi.
10. Futtasd: `node --import tsx --test tests/seeded.test.ts tests/lesson-feedback-openers.test.ts tests/lesson-variety-flag.test.ts
    tests/lesson-opener.test.ts tests/lesson-opener-bank-reuse.test.ts tests/option-order.test.ts tests/quiz-option-order.test.ts
    tests/lesson-ui-text.test.ts tests/source-visuals-flag.test.ts` → mind `pass`. Utána `npx.cmd tsc --noEmit -p .` → 0 hiba;
    `npx.cmd eslint <változott fájlok> --max-warnings 0` → 0.
11. Böngészős próba (zárral): `tests/lesson-verdict.spec.ts` és `playwright.lesson-interactions.config.ts` → `passed`; új eset a
    jelölt leckére három nézetben (360×640, 844×390, 1280×800): a nyitás látszik, nincs vízszintes görgetés, nincs levágás;
    képernyőképek `source/test-results/tgm-s5a/`.
12. Zárás: a terv `<!-- acceptance-checklist -->` pontjainak újraellenőrzése; jelentés a fej hash-ével.

## S5b — Módszersorrend, nyitásformák, névkészlet

Ág: `feat/tgm-s5b-nyitasformak` (az S5a ágáról). A TGM-végrehajtás „S5b” fejezete (773. sortól) a következő igazításokkal: a mag
`seedFrom(mapId)`; minden új viselkedés `lessonVarietyEnabled()` mögött (KI: `bankUnitQuota` mag nélkül = mai kimenet, a prompt bájtra
a régi); BE: `nyitomese-3`; a jelölő verziója `valtozatossag-2`, ha a lejátszó új formát ismer fel. A javítási úton
(`server/studio/structured-improvement.ts:196`) a meglévő `variety` jelölő megőrzése (a `modelLessonSchema` elhagyja) — teszttel.
Mérés: 100 magon ≥ 3 nyitásforma és ≥ 25 név; 50 magon az első módszer ≥ 6-féle.

## S6a, S6b, S6c, SK2

A TGM-végrehajtás megfelelő fejezetei (795., 829., 850., 873. sortól), a terv 4. szakaszának sorszám-igazításaival és a 0. szakasz
kapcsolójával. Az S6c ábra-része: a `role-skills.ts:146` név szerinti színlistája helyett a sáv tokenjei; a négy leíratlan fajta
böngészős próbája 360×640, 844×390, 1280×800 nézetben, képernyőképpel. Az SK2 a bekapcsolási döntéshez modellhívás nélküli szimulációt
és a kiadott állomány csak olvasó újramérését adja.

## S2b

A TGM-végrehajtás „S2b” fejezete (355. sortól) változatlanul; a `STUDIO_SOURCE_VISUALS` kapcsoló érvényes.
