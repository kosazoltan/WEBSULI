# Évfolyam-bank 10–12. évfolyam (JBc) — forrásalapú gyártás, vak megoldás, audit, magyarázat-audit

- **Dátum:** 2026-11-16 · **Szelet:** JBc (terv D18, JB-A1; végrehajtás `### JB`) · **Kanban:** #53
- **Eredmény:** évfolyamonként 90 → **285** tétel (+195); tárgy × sáv cellánként **19** (6 meglévő + 13 új; cél ≥ 18).
- **Gyártó:** Claude Opus 5.5, **évfolyam × tárgy szerint 15 alügynök** (39 tétel / alügynök, a JBb-ben 195 / alügynök), előre
  kiosztott, évfolyamok között diszjunkt témalistával, **forrásból** (minden tételhez forrás-megjegyzés a munkafájlban, a
  magyarázat minden tényállításával együtt; a bankba nem kerül).
- **Vak megoldó (1. kör):** évfolyamonként egy független Sonnet-alügynök (205 kérdés = 195 új + 10 kanári), kézzel másolt `chosen`.
- **Forrásalapú audit (1. körben, párhuzamosan):** öt független Opus alügynök tárgyanként (117 tétel / tárgy), a kulccsal és a
  gyártói forrással.
- **Magyarázat-audit állításonként (1. körben, párhuzamosan):** öt további független Opus alügynök tárgyanként.
- **Bankon belüli ellentmondás (angol):** a `source/scripts/grade-bank-keyword-groups.ts` kimenetén egy független Opus lektor.
- **Újra-vak körök a javítottakon:** friss Opus alügynökök (minden módosult kérdés- / opciószövegű tétel + 10 új kanári / kör).
- **Szaktanári lektorálás:** NINCS.

## A JBa / JBb tanulságai — eleve beépítve
| Korábbi hiba | JBc-megelőzés (gyártáskor, nem utólag) |
|---|---|
| emlékezetből írt irodalmi tény (János vitéz, Szondi két apródja) | forrás-mező kötelező (a validátor bukik nélküle), a magyarázat minden állításának forrása; idézet betűhíven a forrásból |
| hamis magyarázat-mellékállítás | külön magyarázat-audit az 1. körben; a gyártói utasítás: „csak a forrásban látott állítás” |
| túl hosszú kérdés, utólagos rövidítés | a gyártási validátor a JÁTÉK SAJÁT szűrőjét (`fitsAllViewports`, alap-ablak 4000 ms, olvasás ≤ 8600 ms ráhagyással) futtatja → a 585 új tétel rövidítés nélkül 100% játszható |
| rövidítés utáni kétértelműség, többjelentésű szó | a gyártói utasítás külön pontja (óra, nap, vár, él, ég …); rövidítés csak a 19 meglévő tételen volt, ezek mind újra-vak körben |
| létező szó „hibás” opcióként, homonim alak | hunspell a validátorban; mondatba ágyazás |
| matek: lusta regex a számolóban | a független számoló bővítése saját egységtesztekkel, a regexek Edit eszközzel írva |

## Eredmény évfolyamonként
| Évf. | Új | Összesen | Cellák | Vak 1. kör egyezés | Kanári | Megoldói eltérés → elbírálás | SZINT-megj. | Kitalálható-jelzés |
|---|---|---|---|---|---|---|---|---|
| 10. | 195 | 285 | 19 | 195/195 (100%) | 10/10 | 0 (2 kétértelmű-jelzés → mindkettő javítva) | 15 | 7 |
| 11. | 195 | 285 | 19 | 190/195 (97,4%) | 10/10 | 5 → 4 megoldói tévedés, 1 jogos (javítva) | 34 | 4 |
| 12. | 195 | 285 | 19 | 194/195 (99,5%) | 10/10 | 1 → megoldói tévedés | 12 | 11 |

**Megoldói eltérések elbírálása (forrásból):**
- `g11-hungarian-028` „polgár” — a kulcs (német) helyes: en.wiktionary *polgár*, Etymology: „German loan word. Compare Middle High
  German purgære” (a gyártó egy iskolai diasorra hivatkozott; a független forrás megerősítette).
- `g11-hungarian-040` Beszterce ostroma — Pongrácz István vára Nedec; a „Beszterce” elterelő a regény címéből csábító.
- `g11-hungarian-035` A fülemile — Pál és Péter pereskedik (hu.wikisource, a magyarázat-auditor szöveghellyel igazolta).
- `g11-hungarian-037` Toldi estéje — barátruhában megy Budára (hu.wikisource, III. ének 4. versszak).
- `g11-hungarian-025` Kölcsey, Himnusz „Bécsnek büszke vára” (a szöveg a hu.wikisource nyers forrásából ellenőrizve) — a kulcs
  (alliteráció) helyes, de a **metonímia elterelő védhető** (a vár mint a város / hatalom) → elterelő cserélve (hasonlat). Jogos jelzés.
- `g12-hungarian-048` József Attila: Óda — a lillafüredi íróhéten megismert Márton Márta ihlette (hu.wikipedia: József Attila, 1933).

## Forrásalapú audit és magyarázat-audit (1. kör)
| Tárgy | Audit: átnézett (kategória) | Audit: hiba / gyanú | Magyarázat-audit: tétel / állítás | Magyarázat-audit: hiba / gyanú |
|---|---|---|---|---|
| magyar | 117 (a 90, c 21, d 6) | 0 / 1 | 117 / ≈ 354 (76 irodalmi) | 0 / 2 |
| történelem | 117 (d) | 1 / 4 | 117 / ≈ 321 | 1 / 3 |
| természettudomány | 117 (d; minden számolós tétel újraszámolva) | 2 / 2 | 117 / ≈ 295 | 1 / 3 |
| angol | 117 (e) | 0 / 2 | 117 / ≈ 350 | 0 / 3 |
| matek | 117 (d; mind a 117 kulcs kétféle úton, szkripttel is) | 0 / 0 | 117 / ≈ 351 | 0 / 1 |

**Rossz kulcsot az új tételekben sem a megoldók, sem az auditorok nem találtak.** A hibák mind a magyarázatban voltak: Kádár
„1956. október 25-én főtitkár” (az MDP első titkára lett; az MSZMP főtitkára csak 1985-től), Magyarország csapadéka (a Kárpát-medence
peremének 800–1400 mm-es adata az országra vetítve; HungaroMet: 500–800 mm, délnyugatról északkelet felé csökken), a júniusi
napforduló „június 21. vagy 22.” (napjainkban 20. vagy 21.). A gyanúk: forrásfüggő dátum (Népszövetség 1919 / 1920, nyelvrendelet
napja, Mátyás megválasztásának helye), elavult számadat (bélbolyhok „200 m²”), egy nem igazolható idézet („Napsugarak zúgása…”
mint Ady-sor → Tóth Árpád: Körúti hajnal, hu.wikisource), zárt felsorolás (nemesgázok az oganeszon nélkül), pontatlan nyelvtani
általánosítás (whose „csak személyre”; „are után 3. alak”). Az állításszámok az auditorok becslései.

**Bankon belüli ellentmondás (angol, 3–12. évf.):** 14 kulcsszó-csoport, 323 különböző tétel (ebből 96 a 10–12. évfolyamé) → 1 lelet:
`g11-english-032` (stop + to-infinitive „abbahagy, hogy mást csináljon”) ↔ `g11-english-010` (stop + to: cél) — a magyarázat
egységesítve.

**Tartalmi duplikátum (félautomata, a teszt jelölt-szabálya):** a 10–12. évfolyamon 7 jelölt — mind matek-sablon (más feladat,
azonos eredmény: log₂ 32 ↔ log₂ 8 + log₂ 4, sin 30° ↔ sin 150°, két szórás, mértani sorozat tag ↔ hányados …) → indoklással a
`REVIEWED_NOT_DUPLICATE` listán. A történelmi auditor jelezte, hogy három 12.-es tétel magyarázata egy másik tétel válaszát is
kimondja (Korea 1953, 1989. október 23., forint) — nem duplikátum, de a „Miért?” megnyitása után a másik kérdés könnyebb.

## Javított / cserélt tételek (végleges azonosító, gyártói ref, ok)

- `g10-english-028` (g10-english-t1-10) — magyarázat-audit: a whose dologra is állhat („akié vagy amié”)
- `g10-history-020` (g10-history-t1-02) — vak megoldó: az „aranypénzt” szó elárulta az aranyforintot → „firenzei mintára”
- `g10-history-022` (g10-history-t1-04) — audit: „Budán választották” forrásfüggő → a Pestre hívott országgyűlés, a Duna jege
- `g10-history-053` (g10-history-t3-09) — audit: a nyelvrendelet napja forrásonként eltér → nap nélkül
- `g10-hungarian-040` (g10-hungarian-t2-09) — vak megoldó: az „óda” elterelő védhetőnek tűnt → ballada
- `g10-hungarian-044` (g10-hungarian-t2-13) — vak megoldó: a tankönyvi (stilisztikai) felosztásra szűkítve
- `g10-hungarian-056` (g10-hungarian-t3-12) — magyarázat-audit: hiányos mondat
- `g10-math-032` (g10-math-t2-01) — magyarázat-audit: az ellenőrzés nem mondta ki, hogy az 5x értékével egyezik
- `g10-science-041` (g10-science-t2-10) — audit: elavult „200 m²” adat törölve
- `g11-english-020` (g11-english-t1-02) — audit: a despite / in spite of szabály pontosítva
- `g11-english-032` (g11-english-t2-01) — ellentmondás-átnézés (stop + to)
- `g11-english-047` (g11-english-t3-03) — magyarázat-audit: nem igazolható szótári idézet törölve
- `g11-history-020` (g11-history-t1-02) — magyarázat-audit: Napóleon nem „letartóztatták”, hanem megadta magát (1815. július)
- `g11-history-047` (g11-history-t3-03) — audit: a Népszövetség alapításának éve forrásfüggő → évszám nélküli kérdés
- `g11-history-050` (g11-history-t3-06) — magyarázat-audit: az „5000 tanterem” a forrásban önellentmondó → szám nélkül
- `g11-hungarian-022` (g11-hungarian-t1-04) — magyarázat-audit: a név a keresztelő előtti napról (Szilveszter napja), hu.wikisource, 6. rész
- `g11-hungarian-025` (g11-hungarian-t1-07) — vak megoldó: metonímia elterelő → hasonlat
- `g11-hungarian-029` (g11-hungarian-t1-11) — vak megoldó: a felelet a címből kitalálható volt → mit áldozna a szerelméért (életét)
- `g11-hungarian-043` (g11-hungarian-t2-12) — magyarázat-audit: nem igazolható idézet → Tóth Árpád: Körúti hajnal
- `g11-science-050` (g11-science-t3-06) — magyarázat-audit: „régen” → a legrégebbi módszer
- `g11-science-056` (g11-science-t3-12) — audit HIBA: csapadék (HungaroMet) → „a délnyugati országrész”
- `g12-english-033` (g12-english-t2-02) — magyarázat-audit: a szenvedő szerkezet valódi indoka
- `g12-history-024` (g12-history-t1-06) — audit + magyarázat-audit HIBA: Kádár tisztségei
- `g12-history-054` (g12-history-t3-10) — magyarázat-audit: a párizsi béke (1947) és a három falu átadása
- `g12-hungarian-036` (g12-hungarian-t2-05) — audit: az „1957-es verseskötet” nem igazolható → a versre kérdez
- `g12-science-023` (g12-science-t1-05) — magyarázat-audit: nyitott felsorolás (oganeszon)
- `g12-science-055` (g12-science-t3-11) — audit HIBA: a napforduló dátuma
- `g12-science-056` (g12-science-t3-12) — audit: a Száhel a Szaharától DÉLRE húzódó öv, nem a sivatag része
- **Meglévő tételek:** `g11-science-015` (izomerek — lent), `g12-science-011` (két nyilvánvalóan rossz elterelő cserélve),
  `g12-science-013` („nyugalmi energia”).

## Olvashatóság a játék szűrőjével (`fitsAllViewports`, alap-ablak 4000 ms)
| Évf. | Előtte (90 tétel) | Rövidítve (meglévő) | Utána (285 tétel) | Az új tételek |
|---|---|---|---|---|
| 10. | 86/90 (95,6%) | 5 | 285/285 (100%) | 195/195 rövidítés nélkül |
| 11. | 85/90 (94,4%) | 7 | 285/285 (100%) | 195/195 rövidítés nélkül |
| 12. | 84/90 (93,3%) | 7 | 285/285 (100%) | 195/195 rövidítés nélkül |

A 19 meglévő tétel rövidítése (egy rövidítő alügynök; 12-nél a helyes opció szövege is rövidült, `keyChanged`) után mind újra
vak körben.

## Újra-vak körök
| Kör | Tételek | Egyezés | Kanári | Lelet → javítás |
|---|---|---|---|---|
| A | 10 javított új + 19 rövidített meglévő | 28/29 | 10/10 | **`g11-science-015`: a rövidítés után a kulcs a FORDÍTOTT párra mutatott** („eltérő összegképlet, azonos szerkezet”), és a „mindkettő …” opció átcsúszott a tiltott-opció szűrőn (csapda-javaslat a szelet zárójelentésében) → átírva; 3 pontosítás (`g12-science-013`, `g12-science-011`, `g11-science-056`) |
| B | 3 | 3/3 | 10/10 | a `g11-science-015` új alakja logikailag kizárta az elterelőket (kitalálható) → példán alapuló kérdés |
| C | 1 | 1/1 | 10/10 | az „izobután” az „izomer” szót visszhangozta (kitalálható) → etanol és dimetil-éter |
| D | 1 | 1/1 | 10/10 | tiszta |
| E (review #458) | 1 | 1/1 | 10/10 | tiszta |

**Review #458 (Vercel Agent), 2 jogos lelet:**
- `g12-hungarian-053` (A fizikusok): a dráma végén von Zahnd doktornő is azt állítja, hogy Salamon király megjelenik neki
  (de.wikipedia: Die Physiker), így két védhető válasz volt. A kérdés a szanatórium betegeire szűkült, a Zahnd elterelő helyére
  Voss felügyelő került. Újra-vak kör: E. A magyar és a magyarázat-auditor sem fogta meg: a kulcsot igazolták, a teljes
  szereplőlistát nem vetették össze vele.
- `g11-history-053` (Kassa): a hadiállapotot Horthy június 26-án még aznap bejelentette, Bárdossy pedig június 27-én az
  országgyűlésben jelentette be (hu.wikipedia: Kassa bombázása). A magyarázat most mindkét dátumot tartalmazza.

A csak a magyarázatot érintő javítások a vak megoldónak láthatatlanok (ő csak kérdést és opciót kap), ezekre nem volt újra-vak kör.

## A független számoló bővítése (10–12.)
`tests/grade-quiz-bank-coverage.test.ts`: szögfüggvény **táblázatból** (fokban, nevezetes szögek; a régi számolótól független út),
logaritmus (`log₂`, `lg`, alsó indexes alap), törtkitevő (`16^(1/2)`), faktoriális / kombináció, `π`, önálló `/` törtvonal
(`2/(√3 + 1)`), `√3/2` = (√3) / 2; másodfokú egyenlet „x = a vagy x = b” opcióval (mindkét érték gyök és különbözők); sorozat
tagja és összege (tagonként összeadva); statisztika (átlag, medián, módusz — több módusznál nem kiértékelhető —, terjedelem);
koordináta-geometria (távolság, meredekség, felezőpont, kör sugara / középpontja, vektorhossz, vektorösszeg / -különbség);
Viète-formulák és diszkrimináns az együtthatókból (f(0), f(1), f(−1)); klasszikus valószínűség felsorolással (kocka, két kocka,
érmék, golyók). Saját önellenőrző teszt: 60 ismert bemenet → ismert érték, köztük a „két opció is igaz” (1/2 és 0,5) jelzése.
**Kiértékelhető új matek-tétel: 21 / 30 / 26 a 39-ből (10. / 11. / 12.), hibás: 0.** A régi számoló (`grade-quiz-bank.test.ts`)
az összes matek-tételen zöld.

A teszt egy saját hibáját is javítottuk: a tiltott-opció minta `\b`-vel zárult, ami a „mindkettő” „ő”-je után nem illeszkedik
(csapda-javaslat a szelet zárójelentésében) → `(?!\p{L})`.

## Évfolyamonkénti lusta darab (buildelt kliens, `vite build`)
| Darab | Előtte (JBb után) nyers / gzip | Utána nyers / gzip |
|---|---|---|
| grade-10 | 29,6 kB / 9,4 kB | 91,6 kB / 25,9 kB |
| grade-11 | 29,8 kB / 9,4 kB | 93,9 kB / 27,6 kB |
| grade-12 | 30,3 kB / 9,8 kB | 91,3 kB / 26,3 kB |
| fő darab (`main-*.js`) | 327,2 kB / 111,6 kB (bank nélkül) | 326,4 kB / 111,3 kB (bank nélkül) |

Egy 11.-es játékos letöltése (10. + 11. + 12.): 276,8 kB / 79,8 kB gzip. A betöltő (`loader.ts`) nem változott.

## Maradó kockázat (őszintén)
- **Szaktanári lektorálás nincs.** Gyártó ≠ megoldó ≠ auditor, de mind nyelvi modell.
- **Az auditok forrásnyitása részleges:** a tárgyankénti 117 tételes csomagokban az auditorok (saját jelentésük szerint) csak a
  kétesnek látszó állításokhoz nyitottak forrást (történelem: kb. 15 tétel, természettudomány: kb. 12 + 25 újraszámolt, magyar:
  kb. 10 szöveghely); a többit a gyártói forrás-megjegyzéshez és tankönyvi tudáshoz mérték. Az angolban a Cambridge / Oxford /
  Merriam-Webster oldalai 403-at adtak — a gyártók a British Council, a Wiktionary és a Cambridge keresési kivonatai alapján
  dolgoztak, a 11–12.-es angol tételek Cambridge-hivatkozását az auditor nem tudta közvetlenül megnyitni. **A legnagyobb kockázat:
  a 11–12. évfolyam magyar irodalmi tételeinek nem megnyitott szöveghelyei (szereplők, keletkezéstörténet) és a történelmi
  magyarázatok mellékállításai** — ezekben volt a JBb-ben és itt is a legtöbb lelet.
- **Egyforrású tételek** (a gyártók jelezték): néhány nyelvtörténeti tétel (jövevényszó-eredet) egyetlen iskolai diasorra épül
  (a „polgár” német eredetét a Wiktionary utólag megerősítette, a „berkenye” szláv eredetét nem ellenőriztük külön); néhány
  szereplőnév csak az angol Wikipédiából (Márai: Henrik / Konrád, Hemingway: Santiago / Manolin, Dürrenmatt: Möbius).
- **Tantervi besorolás:** a vak megoldók 61 tételt jeleztek „méltatlanul könnyűnek” (főleg 11.-ben földrajz és fizika-alap); nem
  cseréltük, az 1. sávban szándékos alapozás. A NAT / kerettanterv évfolyam-helyét senki nem ellenőrizte forrásból.
- **Kitalálhatóság:** a 12.-es angol szóképzési tételeknél a vak megoldó szerint gyakran csak egy opció létező szó / nyelvtanilag
  illő alak — a szóképzés tudását ez méri, de a nyelvtani helyből is kikövetkeztethető.
- **Gyorsan avuló tények:** a 12.-es állampolgári ismeretekből a gyártó a módosulhatónak ítélt szabályokat (választójogi korhatár,
  mandátumhossz, küszöb) kihagyta.
