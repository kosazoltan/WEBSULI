# Évfolyam-bank 7–9. évfolyam (JBb) — forrásalapú gyártás, vak megoldás, audit, lusta betöltés

- **Dátum:** 2026-11-16 · **Szelet:** JBb (terv D18, JB-A1; végrehajtás `### JB`) · **Kanban:** #47
- **Eredmény:** évfolyamonként 90 → **285** tétel (+195); tárgy × sáv cellánként **19** (6 meglévő + 13 új; cél ≥ 18).
- **Gyártó:** Claude Opus 5.5, évfolyamonként egy alügynök (3 párhuzamosan), előre kiosztott, évfolyamok között diszjunkt
  témalistával, **forrásból** (minden tételhez forrás-megjegyzés a munkafájlban; a bankba nem kerül).
- **Vak megoldó (1. kör):** évfolyamonként egy független Sonnet-alügynök (205 kérdés = 195 új + 10 kanári).
- **Forrásalapú audit (1. körben, párhuzamosan):** négy független Opus 5.5 alügynök tárgycsoportonként (magyar; történelem;
  természettudomány; angol + matek), a kulccsal, a magyarázattal és a gyártói forrással — a forrást nem látatlanban fogadták el.
- **Újra-vak kör a javítottakon:** egy független Opus 5.5 alügynök (a módosult kérdés- / opciószövegű tételek + 10 új kanári / évf.).
- **Szaktanári lektorálás:** NINCS.

## A JBa tanulságai — eleve beépítve
| JBa-hiba | JBb-megelőzés |
|---|---|
| emlékezetből írt irodalmi tény (János vitéz) | a gyártó a mű szövegéből dolgozik, `source` mező kötelező (validátor bukik nélküle); az auditor a forrást ellenőrzi |
| létező szó „hibás” opcióként („gólja”) | a validátor a hunspell magyar szótárral bukik rá; a teszt-őr mostantól a 3–12. évfolyam MINDEN helyesírási tételén fut |
| homonim nyelvtani alak („rajzoltatok”) | a gyártói utasítás mondatba ágyazást ír elő; az auditor (c) kategóriában külön keresi |
| a meglévő teszt „A válasz” sorrend-mintája, `3/4 : 1/2` számoló | a validátor ugyanezekre bukik (a magyarázatban „A felelet”, törttel osztás zárójellel) |
| a javított tételeket nem oldotta meg újra vak megoldó | itt minden módosult szövegű tétel újra vak kört kapott; a JBa 18 javított tétele is (lent) |
| hosszú kérdések | hosszkorlát a kérdés-ablakból levezetve (lent), a validátor és a teszt is bukik rá |

## Hosszkorlát (levezetés)
`windowMsFor(prompt) = alap + (hossz − READING_FREE_CHARS) · READING_MS_PER_CHAR`, felső korlát `WINDOW_MAX_MS` = 9000 ms
(`READING_FREE_CHARS` = 60, `READING_MS_PER_CHAR` = 50, `BASE_WINDOW_MAX_MS` = 6000) → a legnagyobb alappal **120 karakter
fölött nincs több olvasási idő**. A meglévő bank eloszlása: kérdés p50 / p90 / p99 = 47 / 80 / 104 karakter (eredeti 900 tétel),
38 / 59 / 75 (JBa); kérdés + opciók p99 = 218 (eredeti), 159 (JBa). Korlát a JBb-től: **kérdés ≤ 90** (a telítési pont alatt,
+1,5 mp olvasási ráhagyás), **opció ≤ 40**, **kérdés + 4 opció ≤ 170** (20 karakter / mp tempóval ≤ 8,5 mp, a 9 mp-es ablakon
belül). A validátor és a `grade-quiz-bank-coverage.test.ts` bukik rá; a teszt a számot a `questionDirector` állandóiból ellenőrzi.

## Eredmény évfolyamonként
| Évf. | Új | Összesen | Cellák | Vak 1. kör egyezés | Kanári | Megoldói eltérés → elbírálás | SZINT-megj. | Audit (hiba / gyanú) | Javított | Újra-vak: egyezés · kanári |
|---|---|---|---|---|---|---|---|---|---|---|
| 7. | 195 | 285 | 19 | 191/195 (97,9%) | 10/10 | 4 → mind megoldói tévedés (forrásból igazolva) | 15 | 2 / 4 | 10 | 9/9 · 10/10 |
| 8. | 195 | 285 | 19 | 194/195 (99,5%) | 10/10 | 1 → megoldói tévedés | 39 | 0 / 5 | 7 | 7/7 · 10/10 |
| 9. | 195 | 285 | 19 | 195/195 (100%) | 10/10 | 0 | 10 | 1 / 5 | 10 | 8/8 · 10/10 |

Audit tárgyanként (átnézett tétel; kategóriák: a irodalom, b helyesírás, c nyelvtan, d ténykérdés, e angol): magyar a 75, b 7,
c 28, d 19 → 0 hiba, 1 gyanú; történelem d 117 → 2 hiba, 5 gyanú; természettudomány d 117 (mind a 29 számolós tétel újraszámolva)
→ 1 hiba, 1 gyanú; angol e 117 → 0 hiba, 4 gyanú (3 csak forrás-pontatlanság); matek d 117 (mind a 117 kulcs újraszámolva) →
0 hiba, 3 gyanú (téves magyarázat-mellékállítás). **Rossz kulcsot sem a megoldók, sem az auditorok nem találtak.** A 3 „hiba”:
Hammurapi oszlopának megtalálási éve (1901–1902, nem 1910 — a gyártói forrás, a magyar Wikipédia maga téves), „Andrássy az
első miniszterelnök” (Batthyány volt), és két védhető válasz az Európa–Ázsia határnál (Urál és Kaukázus).

- **Megoldói eltérések (mind a kulcs helyes, a magyar auditor a szövegből igazolta):** Szent Péter esernyője — Wibra Gyuri keresi
  az esernyőt, Müncz Jónás tette Veronka fölé; A kőszívű ember fiai — Rideghváry Bencéhez kellene feleségül mennie; Szondi két
  apródja — Ali követe „Márton, az oroszi pap” (hu.wikisource); az Elbocsátó, szép üzenet Ady verse. A Sonnet-megoldó irodalmi
  tételeken gyenge: a tartalmi bizonyítékot itt az auditor szöveg-ellenőrzése adja.
- `chosen`-ellenőrzés minden körben 0 eltérés; a megoldók a `chosen`-t kézzel másolták (a JBa-ban egy megoldó szkripttel töltötte
  ki — ezt most az utasítás kifejezetten tiltotta).

## Javított tételek (végleges azonosító, gyártói ref, ok)

- `g07-math-022` (g7-math-t1-04) — audit gyanú/d
- `g07-math-037` (g7-math-t2-06) — vak megoldó: pontatlan megfogalmazás
- `g07-math-048` (g7-math-t3-04) — audit gyanú/d
- `g07-hungarian-034` (g7-hungarian-t2-03) — audit: a kérdés idézete („fehér leplet”) nem egyezett a szöveggel → idézet nélkül
- `g07-hungarian-052` (g7-hungarian-t3-08) — vak megoldó: a keltezés napja forrásonként eltér (március 13. / 14.) → csere
- `g07-science-024` (g7-science-t1-06) — audit gyanú/d
- `g07-science-039` (g7-science-t2-08) — vak megoldó: „sós víz” kétféleképpen érthető (20% / 25%)
- `g07-science-053` (g7-science-t3-09) — audit hiba/d
- `g07-history-034` (g7-history-t2-03) — audit hiba/d
- `g07-history-045` (g7-history-t3-01) — audit gyanú/d
- `g08-math-047` (g8-math-t3-03) — vak megoldó: az „arány” területarányként is érthető
- `g08-math-054` (g8-math-t3-10) — audit gyanú/d
- `g08-hungarian-025` (g8-hungarian-t1-07) — vak megoldó: a mozaikszó is rövidítés → két védhető felelet
- `g08-history-021` (g8-history-t1-03) — audit gyanú/d
- `g08-history-040` (g8-history-t2-09) — audit gyanú/d
- `g08-history-053` (g8-history-t3-09) — audit gyanú/d
- `g08-history-057` (g8-history-t3-13) — audit gyanú/d
- `g09-math-030` (g9-math-t1-12) — vak megoldó: kitalálható („méretét” szó)
- `g09-math-057` (g9-math-t3-13) — repó-teszt: a meglévő számoló csak két számot olvas
- `g09-english-019` (g9-english-t1-01) — audit gyanú/e
- `g09-english-038` (g9-english-t2-07) — audit gyanú/e
- `g09-english-040` (g9-english-t2-09) — audit gyanú/e
- `g09-english-046` (g9-english-t3-02) — audit gyanú/e
- `g09-hungarian-049` (g9-hungarian-t3-05) — vak megoldó: az „egér” poliszémia és homonímia is lehet → egyértelmű példa
- `g09-hungarian-057` (g9-hungarian-t3-13) — audit gyanú/d
- `g09-science-028` (g9-science-t1-10) — vak megoldó: kitalálható (a kérdés szavát ismételte)
- `g09-history-042` (g9-history-t2-11) — audit hiba/d

A magyarázat-javítás (audit, matek / angol / történelem) a vak megoldónak láthatatlan (ő csak kérdést és opciót kap), ezért
azokra nem volt újra-vak kör; a `g09-math-057` kérdése csak névelőkkel változott (a meglévő számoló két számot olvasott ki
belőle), arra sem.

## A JBa (3–6.) javított tételeinek újra-vak köre
A JBa második auditja 18 tételt javított vak megoldás nélkül. Pótolva: 18 tétel + 10 kanári (Sonnet) → **17/18 egyezés, kanári
10/10**; az egy eltérés (`g05-hungarian-053`, a megoldó a griffmadarat választotta) megoldói tévedés — a kulcs (óriás) a mű
szövegéből igazolt (XXIII–XXIV. ének). A kör jelzései alapján további 3 tétel javult (`g04-hungarian-032` és `g06-science-050`
elterelői kitalálhatók voltak; `g04-history-037` kérdése a monda nevének megadásával kitalálhatóvá vált, ezért átfogalmazva),
ezek újabb vak köre: 3/3 · kanári 10/10, majd a `g04-history-037` utolsó alakja: 1/1 · kanári 10/10 (a megoldó a monda
változatait bizonytalannak jelezte; a JBa auditja a „Mátyás király és a kolozsvári bíró” mondát forrásból igazolta).

## A 7–12. évfolyam MEGLÉVŐ tételeinek szótáras helyesírás-ellenőrzése
A hunspell (`dictionary-hu`) a 7–12. évfolyam összes magyar tételén lefutott: a szövegkörnyezet nélküli helyesírási kérdések közül
egy van a meglévő tételekben (`g08-hungarian-027`, tizenkilenc) — rendben; az egymáshoz hasonló opciójú tételek (7 db) közt sincs
létező szóval „hibás” opció. **Javítandó meglévő tétel nem volt.** Az őr (`grade-quiz-bank-coverage.test.ts`) mostantól az
`EXPANDED_GRADES`-től függetlenül a 3–12. évfolyam minden helyesírási tételén fut.

## Évfolyamonkénti lusta betöltés (mérés)
`data/gradeQuizBank/loader.ts`: évfolyamonként külön dinamikus `import()`; a választó (`pickGradeQuiz`) szinkron marad, a betöltött
évfolyamok pillanatképéből dolgozik; amíg a saját évfolyam darabja tölt, `null` (→ a játék saját bankja). Előtöltés: a
`useGradeLevel` (az évfolyam ismeretében, mountkor) és a `gradeForGame` (kérdéskor) indítja; a saját évfolyam + a két szomszéd.
Hiba: az ígéret kiesik a gyorsítótárból, a háttér-előtöltés 5 mp múlva próbál újra. Node-ban (szerver, egységteszt) a teljes bank
szinkron elérhető. A hívók API-ja nem változott; a játéklapokhoz nem kellett nyúlni.

| | Bank-darab(ok) | Nyers | gzip |
|---|---|---|---|
| Előtte (main, JBa után; a 7–9. még 90 tétel) | egy közös darab, mind a 10 évfolyam (`claimCouponBonus-*.js`, a 6 bankos játéklap közös darabja) | 548,1 kB | 153,6 kB |
| Utána: a közös darab bank nélkül | `claimCouponBonus-*.js` | 4,3 kB | 1,9 kB |
| Utána: évfolyamonként | grade-03 … grade-12 | 29,6 – 98,6 kB | 9,4 – 28,7 kB |
| Egy 7.-es játékos letöltése (6. + 7. + 8.) | 3 darab | 278,4 kB | 77,9 kB |
| Fő darab (`main-*.js`) | nincs benne bank — előtte / utána | 325,9 kB | 111,2 kB |

A bankdarabok nincsenek az `index.html` előtöltési listáján, a fő darab nem hivatkozik rájuk. **Valódi böngészős próba** (buildelt
szerver, Playwright, ideiglenes spec, `/games/space-asteroid-quiz`, 7. évfolyam): a letöltött bankdarabok pontosan
`grade-06, grade-07, grade-08` (1 passed); a célzott meglévő e2e-k (`remaining-learning.spec.ts`, `games-lobby-mobile.spec.ts`):
24 passed. Őr: `tests/grade-quiz-bank-lazy.test.ts`
(forrás: nincs statikus import a bankfájlokra és a `GRADE_QUIZ_ITEMS`-re a kliensben, a betöltő mind a 10 évfolyamot dinamikusan
importálja, az egyben-export `@__PURE__`; viselkedés: null + letöltés, szomszédok, közös ígéret, hiba-kiesés, újrapróba, Node-homlokzat).

## Maradó kockázat (őszintén)
- **Szaktanári lektorálás nincs.** Gyártó ≠ megoldó ≠ auditor, de mind nyelvi modell.
- **A forrás minősége:** a forrás többnyire a magyar Wikipédia; egy esetben maga a forrás volt téves (Hammurapi, 1910), amit csak a
  független angol forrás fogott meg. Ahol a gyártó és az auditor ugyanazt a forrást használta, a közös hiba nem zárható ki.
- **Gyengén forrásolt tételek (a gyártók jelezték):** néhány 7.-es történelmi és földrajzi tény csak megnevezett, meg nem nyitott
  cikkre hivatkozik (a természettudományi auditor ezeket egyenként sem nyitotta meg); az angol alapszókincs (a Cambridge / Oxford
  automatikus lekérése 403).
- **(c) nyelvtan és mondatelemzés:** a mondatelemző tételekhez (határozók, szószerkezetek, mellékmondatok) a magyar auditor nem
  nyitott meg külön forrást; homonímiára nincs gépi őr.
- **Tantervi besorolás:** a NAT 2020 / kerettanterv évfolyam-helyét senki nem ellenőrizte forrásból; a vak megoldók 64 tételt
  „méltatlanul könnyűnek” jeleztek (főleg 8.-ban) — ezeket nem cseréltük, az 1. sávban szándékos alapozás.
- **Lusta betöltés:** az első kérdés a játék saját bankjából jöhet, ha a darab az első kérdésig nem érkezik meg (lassú hálózat);
  a `useGradeLevel` előtöltése ezt a gyakori esetben megelőzi. A Node-homlokzat a `process.getBuiltinModule`-ra épül (Node ≥ 22).
