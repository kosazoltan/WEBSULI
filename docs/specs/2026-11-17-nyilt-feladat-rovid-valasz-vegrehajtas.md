# Végrehajtási utasítás — nyílt feladat: rövid, de tartalmilag teljes válasz → fél pont

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/nyilt-feladat-rovid-valasz`
Terv: `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md`

Útvonalak a `source/` alatt. Fizetős hívás (gyártás, döntőbíró) nem indul. Az `OPEN_ANSWER_RULES_HU` szövege és a
`shared/instruction-bundles/` nem változik (őr-teszt: T3).

## T1 — közös pontozó (`shared/lesson-experience-score.ts`)

Új exportált konstansok / függvények (a kliens, a szerver és a tesztek ugyanazt a szöveget használják):

- `shortButCompleteReason(minWords: number): string` → „A lényeg megvan. Teljes pontért fejtsd ki egész mondatban, legalább N szóval.”
- `shortAndIncompleteReason(minWords: number): string` → „Még nincs benne minden fontos fogalom, és rövid is: írj legalább N szót.”
- `NEEDS_SENTENCE_REASON` → „A fogalmak megvannak. Teljes pontért kösd össze őket kötőszóval (mert, hogy, és, ezért…) — az írásjel nem számít.”

v1 (`evaluateOpenAnswerV1`): a `hits` számítása a hosszvizsgálat ELÉ kerül; ha `tokens.length < minWords`:
`required.length > 0 && hits === required.length` → `{ state: "partial", score: 0.5, reason: shortButCompleteReason }`, különben
`{ state: "fail", score: 0, reason: shortAndIncompleteReason }`. A mondat-ág üzenete `NEEDS_SENTENCE_REASON`.

v2 (`evaluateOpenAnswerV2`): a hosszvizsgálat helyén `shortVerdict(contentCompleteV2(answer, tokens, task), minWords)`. A
`contentCompleteV2`: számolós feladatnál minden típusos rész helyes (nem eldönthetetlen) és a kvóták megvannak; szöveges feladatnál
minden fogalom, kifejezés és a sorrend; tartalmi feltétel nélkül hamis. Nem rövid válasznál a régi ágak sorrendje és üzenetei
változatlanok (a mondat-ág üzenete `NEEDS_SENTENCE_REASON`).

## T2 — HTML-referencia (`server/ai/lesson-html-spec.ts`, `ee_evaluate`)

A `wordCount < minW` ág: `totalReq > 0 && hitReq === totalReq` → `partial` 0,5 a V1 szöveggel, különben `fail` 0 a V2 szöveggel
(ES5, sablonliterál nélkül: szövegösszefűzés `minW`-vel). A mondat-ág üzenete a V3 szöveg. A `:301` sor háromállapotú leírása
kiegészül: „rövid, de minden kötelező fogalom megvan → 0.5”.

## T3 — új tesztek (`tests/open-answer-short.test.ts`)

- v1: rövid + minden csoport → 0,5 + pontos V1 szöveg (N behelyettesítve); rövid + egy csoport hiányzik → 0 + V2; üres → 0; csak
  töltelék → 0; `required` üres → 0; ugyanaz a válasz ponttal / felkiáltójellel → azonos pont; kifejtett mintaválasz → 1.
- v2: típusos helyes érték röviden → 0,5; hibás érték röviden → 0; hiányzó kifejezés (`requiredPhrases`) röviden → 0; hiányzó
  sorrend röviden → 0; kvóta nem teljesül röviden → 0.
- Rövid válasz soha nem 1: a fixture minden feladatán a tömör válasz ≤ 0,5, ha `szószám < minWords`.
- `needsSentence`: elég hosszú, kötőszó nélküli válasz → 0,5 + pontos V3 szöveg.
- Paritás: `ee_evaluate` ugyanazokat a pontokat és üzeneteket adja a v1-gyel a fenti v1-esetekre.
- Őr: `OPEN_ANSWER_RULES_HU` lenyomata (sha256) a változás előtti értékkel egyezik (a teszt a fő ág szövegéből számolt állandót
  rögzíti) — a bank promptja nem változott.
- Levél: `gradeTasks` a tömör válaszra `state: "partial"`, `score: 0.5`; a `buildResultEmail` 🟡 jelölést ad.

## T4 — SPEC-VÁLTOZÁS a meglévő tesztekben (régi → új; minden érintett sor fölött `// SPEC-VÁLTOZÁS 2026-11-17 (nyilt-feladat-rovid-valasz)`)

A teljes egységteszt-futás bukó eseteit EGYENKÉNT kell megvizsgálni: csak akkor írható át, ha (a) a válasz rövid és tartalmilag
teljes (0 → 0,5, `fail` → `partial`), vagy (b) a teszt a régi üzenetszöveget várja. Minden más bukás implementációs hiba. Az átírt
esetek (2 db) a terv „SPEC-VÁLTOZÁS” táblájában: `tests/fixtures/scorer-corpus.json` „túl rövid válasz” (0 → 0,5, `specChange`
mezővel, mellé új „rövid ÉS hiányos → 0” eset) és `tests/scoring-v2.test.ts` „review #159” („8 : 2 = 4”: 0 → 0,5, az üzenet
ellenőrzésével és új „8 : 2 = 5 → 0” esettel).

## T5 — mérés éles adaton (scratchpad-szkript, csak olvasó, már letöltött adat)

12 134 szöveges + a típusos feladatok: (i) a tömör válasz pontszám-eloszlása régi → új; (ii) „kulcsszó-bedobálás” (minden csoport
első alakja véletlen sorrendben, kötőszó nélkül) eloszlása; (iii) a mintaválaszok pontja régi = új; (iv) üres / töltelék válasz 0.
Az eloszlás-tábla a tervbe és a jelentésbe kerül.

## T6 — böngészős próba

ÚJ spec `tests/open-answer-short.spec.ts` (a `lesson-result-email.spec.ts` ál-API-jának mintájára, saját másolattal; a döntőbíró
végpontja az ál-API-ban nem emel): tömör helyes válasz → „0,5 / 1” jellegű kijelzés és a V1 üzenet; kifejtett válasz → teljes pont;
a `POST …/results` törzséből a `gradeTasks` ugyanazt a pontot számolja (a teszt a közös függvényt hívja a beküldött válaszokra).
Előtte E2E-sorompó külön lépésben; `--workers=1`.

## T7 — kapuk

`npm run gate:stage` szakaszonként, a végén `npm run gate:push`; mutációs ellenpróba (a fél pontos ág 1-re / 0-ra állítva, a
teljesség-feltétel elhagyva: a tesztek bukjanak). Push / PR nincs: fej-hash + eloszlás-tábla, utána a független ellenőr.
