# Nyílt feladat: a tömör, de tartalmilag teljes válasz fél pontot kap (nem nullát), egyértelmű üzenettel

**Állapot:** folyamatban – 2026-11-17, ág `fix/nyilt-feladat-rovid-valasz`
Végrehajtási utasítás: [`2026-11-17-nyilt-feladat-rovid-valasz-vegrehajtas.md`](2026-11-17-nyilt-feladat-rovid-valasz-vegrehajtas.md)
Kapcsolódó: [`2026-09-11-bank-rubric-diagnostics.md`](2026-09-11-bank-rubric-diagnostics.md) (a helyreállított szerződés),
`2026-11-17-szoveges-valasz-irasjel.md` (a kitöltős blokk és a köztes lépés — külön ág).

Tulajdonosi hibajelentés (2026-11-17, szó szerint): „Egy újabb hiba, hogy a szöveges feladatoknál ha rak pontot a tanuló, azt is
hibának veszi, ha nem rak pontot, azt is. Ezt is szüntesd meg.” Orkesztrátori döntés (2026-11-17): az (1) + (2) opció együtt.

## Cél

A Feladatok fül nyílt feladatainál a `minWords` szabály ne vigye nullára azt a választ, amely a feladat MINDEN kötelező tartalmi
feltételét teljesíti, csak rövid: az ilyen válasz FÉL pontot kap, biztató üzenettel. A „túl rövid” és a „mondattá” üzenet ne
utaljon írásjelre / mondatformára: mondja meg, mit kell tenni. Ez nem új pedagógiai szabály, hanem a repó elfogadott szerződésének
helyreállítása: „a minden fogalmat tartalmazó természetes mondat teljes pont, a puszta kulcsszólista RÉSZPONT”
(`2026-09-11-bank-rubric-diagnostics.md:18`); „a minWords nem zárhat ki tömör, teljes választ” (`docs/lesson-improvement.md:160`).

## Nem-cél

- TELJES pont a tömör válaszra (tulajdonosi döntés; külön változtatás, ha igent mond).
- A `minWords` értékek újragyártása, a bank promptja (`OPEN_ANSWER_RULES_HU`) és a befagyasztott `websuli-runtime-2` csomag:
  a szöveg NEM változik (nincs promptverzió-emelés; a futásidejű pontozó javítása önmagában hat az éles leckékre).
- A `needsSentence` pontszabálya (marad fél pont), a nyelvtani alak / sorrend / tagadás / típusos érték szabályai.
- A döntőbíró (MI) működése; fizetős hívás nem indul.
- Éles lecke-adat módosítása.

## A felderítés tényei (2026-11-17; útvonalak a `source/` alatt)

- A szabály egy helyen fut minden Stúdió-leckére: `shared/lesson-experience-score.ts` — v1 `:239` (`tokens.length < minWords` → 0,
  „A válasz még túl rövid.”) a részpont-ág (`:241-249`) ELŐTT; v2 `:264` ugyanígy. Kliens: `LessonExperienceView.tsx:79`,
  `HtmlLessonTasks.tsx:27`; szerver / levél: `shared/lesson-result-email.ts` `gradeTasks` (ugyanaz a függvény → a levél pontja együtt
  változik, külön kód nélkül).
- HTML-referencia: `server/ai/lesson-html-spec.ts:423-425` (`ee_evaluate`, `wordCount < minW` → 0) és `:436-` (mondat-ág); paritástesztek:
  `tests/lesson-html-score.test.ts`, `tests/scorer-corpus.test.ts`, `tests/v1-kotojeles-szam.test.ts`, `tests/score-english-negation.test.ts`.
  Élesben a 3 megmaradt régi HTML-anyag egyike sem tartalmaz `ee_evaluate`-et.
- Mérés a 241 éles Stúdió-leckén (csak olvasó GET), 12 134 szöveges rubrikás feladat, „tömör válasz” = minden kötelező csoport első
  alakja, más szó nélkül: 10 100 (83%) → 0 pont „túl rövid”, ponttal és pont nélkül azonosan; a `minWords` nélkül ebből 3577 teljes
  pont, 6500 fél pont, 23 nulla. A `minWords` jellemzően a tömör válasz szószámának kétszerese. `needsSentence`: 6039 feladat (43%).
- Döntőbíró: a kliens minden NEM teljes pontos, nem üres választ elküld (`client/src/lesson-runtime/arbiter.ts:60`:
  `det.state !== "ok"`), a szerver ugyanígy szűr (`server/arbiter/service.ts:54`). A 0 → 0,5 váltás az állapotot `fail`-ről
  `partial`-ra viszi, mindkettő „nem ok” → a döntőbíró-hívások száma NEM változik. A gyorsítótár kulcsa (`server/arbiter/arbiter.ts:35-36`)
  a feladat rubrikájából és a válaszból áll, a pontozó ítéletét nem tartalmazza → a meglévő ítéletek érvényesek maradnak.

## A helyes viselkedés

„Tartalmilag teljes” a válasz, ha a feladat minden kötelező tartalmi feltétele teljesül: minden `required` csoport, minden
`requiredPhrases` csoport, a `requiredOrder`, minden `typedAnswers` részeredmény és minden `requiredDistinct` kvóta — és van
legalább egy ilyen feltétel.

- V1. Rövid (`szószám < minWords`) ÉS tartalmilag teljes → `partial`, 0,5 pont, üzenet:
  „A lényeg megvan. Teljes pontért fejtsd ki egész mondatban, legalább N szóval.” (N = `minWords`).
- V2. Rövid ÉS nem teljes (vagy üres, vagy nincs tartalmi feltétel) → `fail`, 0 pont, üzenet:
  „Még nincs benne minden fontos fogalom, és rövid is: írj legalább N szót.” (a megoldást nem árulja el).
- V3. Elég hosszú, minden megvan, de `needsSentence` és nincs kötőszó → 0,5 (változatlan pont), új üzenet:
  „A fogalmak megvannak. Teljes pontért kösd össze őket kötőszóval (mert, hogy, és, ezért…) — az írásjel nem számít.”
- V4. Minden más ág pontja és üzenete változatlan. A rövid válasz SOHA nem kap teljes pontot.
- V5. A v1, a v2 és a `ee_evaluate` azonosan dönt (a HTML-referenciában nincs típusos mező: ott a „tartalmilag teljes” = minden
  `required` csoport).

## Döntési pont (rögzítve): a nyelvtani alak / sorrend hiánya rövid válasznál

A tömör válasz, amelyből a kért nyelvtani kifejezés vagy sorrend hiányzik („desk, room” a „There's a desk in the room.” fordítására),
NEM tartalmilag teljes → marad 0 pont a V2 üzenettel. Indok: fordítási / nyelvtani feladatnál két főnév fél pontja hamis elfogadás
volna; a szabály célja a tartalmilag teljes válasz megmentése.

## SPEC-VÁLTOZÁS a meglévő tesztekben (régi → új, tételesen; más elvárás nem lazul)

A végrehajtási utasítás T4 pontja sorolja fel fájl:eset szinten — csak azok az esetek változnak, ahol a rövid válasz tartalmilag
teljes (0 → 0,5), illetve ahol a teszt az üzenet régi szövegét várja.

## Edge case-ek

- Üres / csak írásjel / csak töltelékszó → 0 (V2). Egy kötelező fogalom a kettőből, röviden → 0 (V2).
- Minden fogalom véletlen sorrendben, kötőszó nélkül, de `minWords` fölött → a régi szabályok (1 pont, vagy `needsSentence` mellett 0,5).
- Rövid, teljes, de váratlan tagadással → 0,5 (a rövid ág felső korlátja úgyis fél pont).
- Típusos feladat, helyes érték, kevés szó („8 : 2 = 4”, `minWords` 4) → 0,5 a V1 üzenettel; hibás érték röviden → 0.
- Feladat tartalmi feltétel nélkül (`required` üres, nincs típusos mező), rövid válasz → 0.

## Elfogadás (EARS)

- E1. AMIKOR a válasz tartalmilag teljes, de rövidebb a `minWords`-nél, A RENDSZER 0,5 pontot ad a V1 üzenettel (v1, v2, `ee_evaluate`).
- E2. AMIKOR a rövid válaszból kötelező tartalom hiányzik, A RENDSZER 0 pontot ad a V2 üzenettel.
- E3. A rövid válasz semmilyen bemenetre nem kap 1 pontot; éles adaton a tömör válasz és a „kulcsszó-bedobálás” (minden fogalom,
  véletlen sorrend, kötőszó nélkül) eloszlása mérve, 1 pont csak ott, ahol a régi szabály is 1-et adott.
- E4. A `needsSentence` ág pontja változatlan, az üzenete a V3 szöveg.
- E5. A mintaválasz minden éles feladaton ugyanazt a pontot kapja, mint a változás előtt (regresszió nincs az elég hosszú válaszokon).
- E6. A levél (`gradeTasks`) ugyanazt a pontot és jelölést (🟡) adja, mint a képernyő.
- E7. Böngészőben, helyi leckén: tömör helyes válasz → fél pont + V1 üzenet; kifejtett válasz → teljes pont; a beküldött válaszból a
  szerveroldali pontozó ugyanazt számolja.
- E8. A bank promptjának szövege (`OPEN_ANSWER_RULES_HU`) bájtra változatlan.

<!-- acceptance-checklist -->
- [ ] E1 – rövid + teljes → 0,5 (v1, v2, ee_evaluate)
- [ ] E2 – rövid + hiányos → 0, pontos üzenet
- [ ] E3 – rövid válasz soha nem 1 pont; éles eloszlás mérve
- [ ] E4 – needsSentence üzenet
- [ ] E5 – a mintaválaszok pontja változatlan éles adaton
- [ ] E6 – a levél pontja egyezik
- [ ] E7 – böngészős próba
- [ ] E8 – a bank promptja változatlan
