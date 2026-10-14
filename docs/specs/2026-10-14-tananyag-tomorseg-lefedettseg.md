# Tananyag tömörsége és forrás-lefedettsége: mérés, v7.5-összevetés, javítási terv (2026-10-14)

Állapot: **JÓVÁHAGYVA (tulajdonos, 2026-10-14). S1 kész (#210); S2 külön PR, mérés alatt.** Végrehajtás:
`docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg-vegrehajtas.md`.

## Kérés
Tulajdonos (2026-10-14): a szülők szerint a pipeline leckéi túl hosszúak, és az adott témában nem tartalmaznak mindent a
feltöltött anyagból. Vesd össze a Tananyag Készítő 7.5 skill tudásával (üzleti, tanulói, pedagógiai szempont), mérd meg,
hogy igaz-e vagy szubjektív, és a mérések alapján tervezz javítást a pipeline promptjaira.

## Mérés 1 — a tárolt pipeline-leckék (élő DB, csak olvasás)
Eszköz: `source/scripts/measure/lesson-length-coverage.mts` (determinisztikus, modellhívás nélkül, ellenőrzött TLS).
Adat: `docs/measurements/2026-10-14-lesson-length-coverage.json` — 43 lecke (térképenként a legutolsó verzió, anonim
azonosítóval), ebből 36 valós (próba/teszt/QA kiszűrve). Hossz = a diák által LÁTOTT szöveg (a megalapozási kapu `blockText`
mezői: explain, example, check kérdés+opciók, az ábra és a `try` feladat renderelt szövege, recap pontok); a válasz utáni
visszajelzésből csak a kiválasztott (helyes) opcióé, külön. Medián: páros elemszámnál a két középső átlaga (review #210).

| forrásméret | db | forrás szó (medián) | tanítórész szó | arány | szakasz | forrás→térkép | forrás→tanítás | nem-forrás szó |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kicsi (<300) | 11 | 46 | **2657** | **49×** | 10 | 96% | 92% | **92%** |
| közepes (300–2000) | 13 | 1341 | 2425 | 1,8× | 12 | 65% | 64% | 62% |
| nagy (>2000) | 12 | 4753 | 2304 | 0,40× | 12 | **33,5%** | **16,5%** | 47,5% |

- Teljes medián: tanítórész **2394,5 szó ≈ 20 perc olvasás** (120 szó/perc); 11,5 fejezet. A bank külön lapon:
  80 kvíz + 48 feladat + 24 módszer (körönként 25/15 látszik).
- **A hossz nem függ a forrástól**: forrásszó ~ tanítórész-szó Pearson r = −0,09. A leckék fele (18/36) a 12-es plafonon.
- **A lefedettség a forrás méretével omlik**: forrásszó ~ forrás→tanítás% r = −0,77. A veszteség két lépcsős: kinyerés
  (nagy forrásnál a térkép a forrás-szótövek 33,5%-át tartja meg) és szerzés (16,5%).
- Olvashatóság nem a gond: átlagos mondathossz 7–10 szó, >20 szavas mondat 0–6%.

**Ítélet:** a panasz **mérhetően igaz**, két ellentétes módon: kis forrásnál a lecke felfújt (49×, 92% nem forrásból jövő
szótő), nagy forrásnál hiányos (16,5%-os forrás→tanítás lefedettség). A hossz egy fix sablon terméke, nem a forrásé.

Mérési korlátok (kontra): a lefedettség lexikális (6 betűs szótövek); a „nem-forrás” arányba pedagógiai keretszavak is
esnek (feladat, gondold, példa); nagy forrásnál a témafókusz szándékosan szűkíthet (`topic-focus.ts`, „extra” súly) — ezért
a nagy forrás alacsony lefedettsége részben szándékos lehet. A szülői „túl hosszú” érzet a Tananyag lapra vonatkozik; a bank
körönként 25/15 tételt mutat.

## Mérés 2 — próbafuttatás: v7.5 skill ugyanazon a forráson
Ugyanaz a szerzőmodell (claude-opus-5-5, medium), a teljes v7.5 SKILL.md rendszerpromptként, a forrásszöveggel; csak az
1. tab (tanítórész) — a 45/75-ös bank mindkét rendszerben azonos. Adat: `docs/measurements/2026-10-14-skill75-vs-pipeline-trial.json`.

| forrás | forrás szó | v7.5 szó | pipeline szó | v7.5 lefedettség | pipeline lefedettség | v7.5 / pipeline nem-forrás |
| --- | --- | --- | --- | --- | --- | --- |
| Időszámítás (7. évf.) | 239 | 2725 | 3807 | 90% | 93% | 83% / 78% |
| Zöldségek (5. évf.) | 1352 | 2826 | 2142 | **87%** | 68% | 35% / 34% |
| Hunyadi (6. évf.) | 8194 | 3183 | 3595 | **32%** | 22% | 32% / 33% |

Költség: 1,82 USD, 3,2–3,9 perc/lecke. Ismétlés (6 szavas egyezés): v7.5 0–3%, pipeline 4–7%.

**Ítélet:** a v7.5 **nem következetesen rövidebb** (2-ből rövidebb, 1-ben hosszabb), és kis forrásnál ugyanúgy felfúj. Ami
mérhetően jobb: **a lefedettség közepes és nagy forrásnál (+10…+19 pont)**, mert a v7.5 a TELJES forrásszöveget olvassa.

## A v7.5 skill és a pipeline összevetése (szöveg + mérés)
| szempont | v7.5 skill (SKILL.md) | pipeline | következmény |
| --- | --- | --- | --- |
| Hosszkorlát | nincs; „teljes mélység, NEM vázlat” (:40, :71–72, :75) | nincs; „teljes, mély”, „ne rövidítsd vázlattá” (`step-io.ts:473`) | egyik sem tömör tervezetten |
| Szerkezet | 4 tab, fejezetkártyák + mini-összefoglaló (:58–65, :87) | fix 5-elemes fejezet-sablon, ≤12 fejezet (`step-io.ts:327–335`) | a pipeline sablonja forrástól függetlenül 10–12 fejezet |
| Lefedettség | a teljes forrást olvassa; ellenőrzés nincs (:75; verify.py csak formai) | csak a fogalomtérképet látja (`step-io.ts:351–352, 519–520`); címke-kapu (`coverage.ts`) | a pipeline-ban a kinyerés a szűk keresztmetszet |
| Pontosság | forráshű-szabály és kapu nincs; NAT-webkutatás, érdekességek megengedve (:81, :109, :573) | D1-lektor, szó szerinti idézet, megalapozási kapu | **a pipeline a pontosabb**; a v7.5 pontosságát nem szabad átvenni |
| Bank | 45/15, 75/25 (:128, :320) | 45/15, 75/25 (`lesson-experience.ts:12`) | azonos |
| Olvashatóság | évfolyamsávos mondathossz (:78–80) | évfolyamsávos regiszter (`lesson-band.ts:59–67`) | mérve azonos |

Üzleti/tanulói/pedagógiai következtetés: a v7.5-ből a **forrás teljes olvasását** érdemes átvenni (lefedettség), a
**pontossági láncot meg kell tartani** (a pipeline erőssége). A tömörséget a v7.5 nem adja — ezt új, mérhető terjedelmi
szabállyal kell bevezetni.

## Cél
- **G1 Terjedelem a forráshoz és az évfolyamhoz kötve**, nem fix sablonból: kis forrás nem fúvódik fel, a fejezetszám a
  tanított fogalmak számából jön.
- **G2 A témához tartozó forrástartalom ne vesszen el**: a tervező és a szerző lássa a forrás témához tartozó szövegét is
  (nem csak a térképet), és a lefedettség mérve legyen.
- **G3 A pontosság nem romolhat**: D1, idézet-ellenőrzés, megalapozási kapu és lektor változatlan.

## Nem cél
- A 45/75-ös bank méretének változtatása (termékszabály, a v7.5-ben is azonos; a diák körönként 25/15-öt lát).
- A v7.5 HTML-motorjának, TTS-ének, elrendezésének átvétele (a pipeline saját renderere fut).
- A v7.5 lazább forrásszabályainak (NAT-kutatás, érdekesség) átvétele.

## Javítási terv (szeletek, mindegyik ≤ ~400 sor, saját mérési kapuval)
**S1 — Mérőeszköz és alapvonal a kódban (prompt-változás nélkül).** A `lesson-length-coverage` mérő tesztelt modulként
(`server/studio/lesson-metrics.ts`): látható szószám, olvasási idő, forrás→térkép→tanítás lefedettség, nem-forrás arány,
ismétlés. A mostani 43 lecke mérése az alapvonal (fixture). Offline próbaharness: a VALÓDI `buildPedagoguePrompt` /
`buildAuthorPrompt` + `callStepModel`, DB-írás nélkül, 6 rögzített térképen (2 kicsi, 2 közepes, 2 nagy).

**S2 — Terjedelmi szerződés (tervező + szerző prompt).** Mért alapon:
- Fejezetszám = a tanított fogalmakból: `clamp(ceil(core+supporting / 3), 2, 12)`; a sablon-fejezetek (motiváció, „feladat
  megoldva”, „leggyakoribb hibák”, „Ellenőrzés”) **feltételesek**: csak ha a forrásban van gyakorlófeladat / ≥3 forrásbeli
  tévhit; különben a fogalom-fejezetbe olvadnak.
- Szókeret évfolyamsávonként és fogalmanként (a kezdőértéket az S1-próba kalibrálja; javasolt kiindulás: kid 1–4. évf.
  ~45 szó/fogalom, ≤ 900; 5–6. ~60 szó/fogalom, ≤ 1400; 7–8. ~75 szó/fogalom, ≤ 1800 a Tananyag lapon).
- Kis forrás (< 300 szó): a lecke legfeljebb a forrás többszöröse (kalibrálandó), és nincs általános-tudás kitöltés.
- A „Ne rövidítsd vázlattá…” sor és a duplán injektált „teljes, mély” minőségi szerződés helyére: „tömör és teljes: minden
  fogalom egyszer, a legrövidebb érthető magyarázattal; fejezetenként egy mini-összefoglaló” (a v7.5 :87 bevált eleme).
- A kapu (`lesson-arc`) méri a keretet: túllépés → célzott javító kör (nem elutasítás).

**S3 — Forrásszöveg a tervezőnek és a szerzőnek (lefedettség).** A témafókusz utáni, témához tartozó forrás-részletek
(oldal/fejezet szerint, kerettel) bekerülnek a promptba „csak olvasásra, a térkép a tanítható egység” szabállyal; a szerző a
forrás témabeli tényeit nem hagyhatja ki, és nem tehet hozzá forráson kívüli állítást (D1 változatlan).

**S4 — Kinyerés nagy forrásnál.** A térkép a nagy forrás szótöveinek 34%-át tartja: fejezetenkénti (darabolt) kinyerés a
24 576 tokenes kimeneti keret helyett, és lefedettségi riport a forrás→térkép lépésre (a kimaradt témabeli bekezdések
listája az adminnak).

## Elfogadás (EARS) — a 6 rögzített próbatérképen, az alapvonalhoz mérve
- **E1** Kis forrásnál a Tananyag lap medián szószáma SHALL legalább 50%-kal csökkenni; közepes forrásnál legalább 25%-kal.
- **E2** Közepes és nagy forrásnál a forrás→tanítás lefedettség SHALL legalább a v7.5 próbafuttatás szintjét elérni
  (Zöldségek ≥ 85%, Hunyadi ≥ 30%), a témafókuszon kívüli rész nélkül számolva.
- **E3** A fedettségi kapu (`checkCoverageGate`) és a lektor SHALL nem adni több blokkoló hibát, mint az alapvonal.
- **E4** A nem-forrás szótő-arány kis forrásnál SHALL 92%-ról legalább 60% alá csökkenni.
- **E5** Olvashatóság nem romlik: átlagos mondathossz ≤ évfolyamsáv-szabály, ismétlés ≤ 5%.
- **E6** `check`, `check:test`, `lint`, `test`, `build` zöld; élő próbagyártás 2 forráson tulajdonosi jóváhagyással.

## Kockázatok
- A rövidebb tanítás ronthatja a bank minőségét (a bank a tanításból épül) → S2-ben a bank-ellenőr hibaszámát is mérjük.
- A forrásszöveg a promptban növeli a bemeneti tokent (nagy forrásnál ~+40–50K) → témafókusz utáni szeletelés és keret.
- A szókeret túl szigorú lehet matek-eljárásoknál (lépéses példák) → a példák lépései külön keretet kapnak.

## Költség-becslés a próbákhoz
S1–S2 próbák: 6 térkép × 2–3 változat × (tervező + szerző) ≈ 5–10 USD; S3–S4 hasonló nagyságrend.
