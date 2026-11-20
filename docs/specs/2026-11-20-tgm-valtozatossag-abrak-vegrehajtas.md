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
`tests/seeded.test.ts`, `tests/lesson-feedback-openers.test.ts`, `tests/lesson-variety-flag.test.ts`,
`tests/verdict-feedback-variety.test.ts` (újak; az utóbbi a `VerdictFeedback` DOM-ját méri jelöletlen és jelölt leckén),
`client/src/lesson-runtime/feedback-variety.ts` (új, a kontextus — külön fájlban a gyorsfrissítés-szabály miatt).

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
   `startsWithLegacyOpener(text)` (2026-11-22 óta: felismerés levágás helyett, lásd lent); `feedbackOpenerKey(mapId, question, options)` (`choiceSeed`-del); `feedbackView({ right, text, variety })`
   → `{ opener?: string; reason: string }` — jelöletlen leckén `{ reason: stripVerdictPrefix(text, right) }`.
4. `shared/lesson-schema.ts`: `variety: z.object({ version: z.string().trim().min(1).max(40) }).passthrough().optional().catch(undefined)`
   a `lessonSchema` gyökerén; a bővítés előtti (KI) modell-séma `.omit({ variety: true })` (a főághoz híven elhagyja). A BE ág a teljes
   `lessonSchema` marad (azonosság-őr: `tests/source-visuals-flag.test.ts` „KI (J2)” — nem gyengíthető); ott a jelölőt a mentés határa
   írja felül / törli (8. lépés). A javítási út (`structured-improvement.ts`) jelölő-kezelése az S5b feladata.
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

## S5a — vak kör 1–2 javítása (2026-11-22): hibaosztályok

Invariáns: a változatossági állapot egy futásra EGY döntés (a futás elején, folytatásnál a mentett job-állapotból, javításnál a tárolt
leckéből); a jelölőt a modell soha nem adhatja; KI állapotban minden út kimenete a régi. A környezetet csak a `lessonVarietyEnabled()`
olvassa, a futás olvasói az `effectiveLessonVariety()`-t (a `runWithLessonVariety` hatóköre).

| Út | Állapot forrása | Jelölő forrása | KI kimenet | Teszt |
|---|---|---|---|---|
| Első gyártás (`runSingleLesson`) | `deps.lessonVariety` ?? környezet, a futás elején | `withVarietyMarker(…, állapot)` a mentés előtt; a modellé eldobva | nincs jelölő, nincs `lessonVariety` a jobon | `lesson-variety-paths` „első gyártás” |
| Modellkimenet elfogadása a gyártásban (szerző, ábrafolt) — vak kör 2, L2 | — | a modell jelölője az elfogadáskor eldobva (`withVarietyMarker(…, false)`) | a job checkpointja és végső `output.lesson`-je jelölő nélkül (KI és BE) | `lesson-variety-paths` „vak kör 2, L2” |
| Célzott fogalomjavítás (`fixConceptInConversation`) — vak kör 2, L3 | a tárolt lecke jelölője (`runWithLessonVariety`) | `carryVarietyMarker(jelölt, eredeti)` az elfogadáskor; alkalmazáskor a zárolt sorból | jelöletlen leckén BE környezetben is KI bank | `lesson-variety-paths` „vak kör 2, L3” (két irány) |
| Folytatás (`resume`) | kizárólag a job kimenetének `lessonVariety` mezője (hiány = KI) | ugyanaz | KI-ben indult futás BE környezetben is KI | `lesson-variety-paths` „L4” (mindkét irány) |
| Szerzői prompt (`buildAuthorPrompt`) | `effectiveLessonVariety()` | — | `PLAYFUL_AUTHOR_RULES` bájtra | `source-visuals-flag`, `lesson-variety-flag` |
| Bank (előtag, egységverzió, átvétel) | `effectiveLessonVariety()` | — | `nyitomese-1`, régi előtag | `lesson-variety-paths` „A: hatókör”, `lesson-opener-bank-reuse` |
| Mentés (`upsertLesson`) | `effectiveLessonVariety()` | szerver | jelölő törölve | `lesson-variety-paths` „első gyártás” |
| Javítás — előnézet (`buildStructuredImprovement`) | a tárolt lecke jelölője | `carryVarietyMarker(jelölt, eredeti)` | jelöletlen jelölt, KI prompt / bank | `lesson-variety-paths` „L1” (két eset) |
| Javítás — alkalmazás (`applyStructuredImprovement`) | — | `carryVarietyMarker(jelölt, zárolt sor)` | a modell jelölője nem íródik ki | kódút (DB-integráció nélkül) |
| Visszaállítás, évfolyamváltás, lazítás | — | a tárolt JSON változatlanul | változatlan | meglévő tesztek |
| Megjelenítés | a lecke jelölője | — | jelöletlen DOM a régi (élő régió sincs) | `verdict-feedback-variety`, böngészős próba |

**Szövegkezelés — spec-változás (tulajdonosi döntés 2026-11-22, „NINCS LEVÁGÁS”; a vak kör 1 L2-javítását felülírja):** a modell
visszajelzés-szövegéhez a kód jelölt leckén NEM nyúl (nincs előtag-levágás, nincs nagybetűsítés). A kódszótári nyitás csak akkor kerül
elé, ha a szöveg nem kezdődik a régi nyitások zárt listájának (`LEGACY_OPENER_PREFIXES`) egyik elemével — pontos, kis- és nagybetűre
érzékeny egyezés a szöveg elején, utána szövegvég vagy nem betű; ilyenkor nincs csere és nincs kódnyitás. A kódszótár egyetlen eleme sem
kezdődhet a lista elemével (teszt). A jelöletlen lecke kimenete a korábbi (ítélet-előtag levágása, változatlanul). A levágás kódja és
tesztjei kikerültek; új teszt: a modell szövege minden esetben bájtra változatlan (kód, képlet, mínusz, nyitással kezdődő szöveg).

**Élő régió:** jelölt leckén előre felcsatolt udvarias élő régió (vak kör 1, L3); csak friss válasz után kap szöveget — a tanuló
gombnyomása élesíti 2 másodpercre, a mentett válasz felcsatoláskori helyreállítása (újratöltés, rejtett fül) néma (vak kör 2, L4).

**Nyitott jegy (vak kör 2, L5):** a böngészős próba kérdésenként konkrét kódnyitást és újratöltés utáni azonosságot mérjen, a kvízteszt ne
a teljes szótári uniót használja — a kliensoldali konstanskulcs-mutáció bukjon. (A kanban-CLI ebben a környezetben nem érhető el; a jegyet
az orkesztrátor veszi fel.)

Részletes lépések (munkafa `.claude/worktrees/tgm-s5b`; a terv 11. szakasza szerint):

Fájlok: `shared/lesson-opener.ts`, `shared/lesson-bank-plan.ts`, `shared/lesson-feedback-openers.ts`, `shared/lesson-block-label.ts`,
`server/studio/step-io.ts`, `server/studio/experience-builder.ts`, `server/studio/single-run/engine.ts`,
`server/studio/structured-improvement.ts`, `server/workflows/apply.ts`, `client/src/lesson-runtime/LessonRuntime.tsx`; tesztek:
`tests/lesson-opening-forms.test.ts` (új), `tests/lesson-bank-plan-seed.test.ts` (új), `tests/lesson-variety-flag.test.ts`,
`tests/lesson-feedback-openers.test.ts` (bővül).

1. **Bukó tesztek ELŐBB:**
   - `tests/lesson-opening-forms.test.ts`: `OPENING_FORMS` lépcsőcsoportonként (L1–L2, L3–L4, L5–L6) 3–4 forma, mindegyik leírása 2–3
     mondat; `HERO_NAMES` ≥ 40 egyedi név, a „Bence”, „Dóra”, „Dóri” nélkül; `openerVarietyPick(classroom, seed)` determinisztikus;
     100 magon csoportonként ≥ 3 forma és ≥ 25 név; `lessonOpenerContract(c, { variety: { seed } })` BE: nincs „PONTOSAN 5”, van
     „3–6 mondat”, a hős neve és a forma a promptban, fejléc `nyitomese-3`, a Célkártya-sorok bájtra a régiek; mag nélkül bájtra a régi.
     `playfulQuestioningContract(true)` nem tartalmazza a „Peti” szót; `lessonOpenerLektorChecklist(true)` „3–6 mondat”, KI = régi
     konstans; `blockLabel` a nyitóblokkra a kiosztott forma címkéjét adja (`openingForm` paraméter), nélküle a régi „Mese” / „Történet”.
   - `tests/lesson-bank-plan-seed.test.ts`: mag nélkül a kimenet a régi (rögzített példán); 50 magon minden csomagkészletben mind a tíz
     fajta + két `gate`, csomagonként ≥ 2 fajta, az első csomag első fajtája ≥ 6-féle.
   - `tests/lesson-feedback-openers.test.ts`: `withVarietyMarker` BE-nél `{ version: "valtozatossag-2", openingForm }` a lecke
     `mapId` + `classroom` alapján (ugyanaz, amit a prompt kapott).
   - Javítási út: `appliedLessonMatches` (`server/workflows/apply.ts`) a `variety` kulcsot is figyelmen kívül hagyja, mint az `art`-ot.
2. `shared/lesson-opener.ts`: `HERO_NAMES`, `OPENING_FORMS`, `OPENING_FORM_LABEL`, `openerVarietyPick`, a `lessonOpenerContract`
   `variety` opciója, `lessonOpenerLektorChecklist(variety)`; a `playfulAuthorRules` / `playfulQuestioningContract` BE ága
   `nyitomese-3`, a „Peti szerint…” példa helyett „egy megnevezett szereplő téves állítása és a lecke ténye”. (Az S5a `nyitomese-2`
   elvárása dokumentált spec-változással `nyitomese-3`-ra lép — terv 11. szakasz.)
3. `shared/lesson-bank-plan.ts`: `bankUnitQuota(plan, unitIndex, seed?)` — maggal a `[...METHOD_KINDS, "gate"]` `seededShuffle`-lel
   keveredik a körbeosztás előtt.
4. Bekötés: `engine.ts` a `buildAuthorPrompt` új, opcionális `variety` paraméterébe `{ seed: seedFrom(mapId) }`-t ad BE kapcsolónál;
   `step-io.ts` a `lessonOpenerContract`-nak továbbadja, a lektor a `lessonOpenerLektorChecklist(lessonVarietyEnabled())`-t kapja;
   `experience-builder.ts` a `bankUnitQuota`-nak BE kapcsolónál `seedFrom(lesson.mapId)`-t ad; `structured-improvement.ts` a mentés
   előtt `withVarietyMarker`; `LessonRuntime.tsx` a `blockLabel`-nek a `lesson.variety?.openingForm`-ot adja.
5. Futtasd: `node --import tsx --test tests/lesson-opening-forms.test.ts tests/lesson-bank-plan-seed.test.ts
   tests/lesson-variety-flag.test.ts tests/lesson-feedback-openers.test.ts tests/lesson-opener.test.ts tests/bank-item-ref.test.ts
   tests/source-visuals-flag.test.ts tests/single-run-engine.test.ts tests/lesson-block-label*.test.ts` → `pass`; `tsc --noEmit` 0;
   eslint a változott fájlokra 0.
6. Nehéz kör (zárral, `tgm-s5b`): gate:stage → npm test → böngészős próba (a nyitóblokk címkéje jelölt leckén) → gate:push.

## S6a, S6b, S6c, SK2

A TGM-végrehajtás megfelelő fejezetei (795., 829., 850., 873. sortól), a terv 4. szakaszának sorszám-igazításaival és a 0. szakasz
kapcsolójával. Az S6c ábra-része: a `role-skills.ts:146` név szerinti színlistája helyett a sáv tokenjei; a négy leíratlan fajta
böngészős próbája 360×640, 844×390, 1280×800 nézetben, képernyőképpel. Az SK2 a bekapcsolási döntéshez modellhívás nélküli szimulációt
és a kiadott állomány csak olvasó újramérését adja.

## S2b

A TGM-végrehajtás „S2b” fejezete (355. sortól) változatlanul; a `STUDIO_SOURCE_VISUALS` kapcsoló érvényes.

## S6a — Fejezetív-készlet (részletes lépések)

Ág: `feat/tgm-s6a-fejezetiv` (az S5b ágáról), munkafa `.claude/worktrees/tgm-s6a`. Terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md`
12. szakasz. Fájlok: `shared/lesson-section-shapes.ts` (új), `server/studio/step-io.ts` (séma + pedagógus-prompt BE ága),
`server/studio/single-run/engine.ts` (átírás a terv elfogadása után), `scripts/measure/shape-simulation.mts` (új),
`tests/lesson-section-shapes.test.ts` (új).

1. Bukó tesztek: V13 (ál-lecke mintánként → `checkLessonArc` ok), V14 (3…12 fejezet × 200 mag), V15 (`applySectionShapes`: BE átír,
   különleges fejezet és jóváhagyott terv marad, záró recap; KI: ugyanaz az objektum, kéretlen `sectionKind` nélkül; a pedagógus-prompt
   KI bájtra a régi, BE kéri a `sectionKind`-ot és nem mondja az egyetlen ívet), V16 (`shapeSimulation` < 0,35 / < 0,2).
2. Kód a fenti fájlokban; a motor: `const outline = planned === undefined ? applySectionShapes(rawOutline, …) : rawOutline`.
3. Futtasd: `node --import tsx --test tests/lesson-section-shapes.test.ts tests/lesson-arc.test.ts tests/source-visuals-flag.test.ts
   tests/single-run-engine.test.ts tests/studio-role-skills.test.ts` → pass; `node --import tsx scripts/measure/shape-simulation.mts` →
   a két szám a PR-be; `tsc --noEmit` 0; eslint 0.
4. Nehéz kör zárral (`tgm-s6a`).
