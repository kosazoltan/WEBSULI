# Szóbank — de — vak megoldós ellenőrzés

- **Dátum:** 2026-11-15
- **Szelet:** S4 (kanban #21), ág `feat/jatekok-s4-szobank-de`
- **Gyártó modell:** Claude Sonnet 5.5 (5 párhuzamos alügynök, szintenként egy fájl)
- **Integrátor (szúrópróba, elbírálás, javítás):** Claude Opus 5.5
- **Megoldó modell:** Claude Opus 5.5 — minden körben a gyártótól és az integrátortól független, friss alügynök; csak a kérdésfájl útvonalát kapta, a repó fájljainak olvasása utasítással tiltva
- **Seed:** 1115 (első kör), 1116 (fix-kör)
- **Export-parancs:** `cd source && node --import tsx scripts/vocab-bank.ts blind-export --lang de --level <n> --seed 1115 --out <scratchpad>/blind-de-<n>.json --key-out <scratchpad>/blind-de-<n>.key.json --canary 10`
- **Pontozás:** `node --import tsx scripts/vocab-bank.ts blind-score --key <…>.q1.key.json --answers <…>.answers.json --out <…>.flagged.json`

## Módszer

1. **Szűkített készlet (q1).** A teljes export szintenként 923–1423 kérdést adott, mert egy bejegyzésből 2–3 kérdés
   készül (hu→német, német→hu, hiányos mondat). A tartalom-ellenőrzéshez bejegyzésenként egy kérdés elég, ezért a
   kulcs alapján bejegyzésenként PONTOSAN EGY kérdést tartottunk meg: szónál a bejegyzés sorszámának paritása szerint
   (páros → német→hu, páratlan → hu→német), kifejezésnél német→hu (az export `phrase-meaning` típust nem készít);
   hiányos mondat csak tartalékként (egyszer sem kellett). Mind a 10 kanári külön tételként maradt benne; ha egy
   bejegyzés választott tétele kanári lett volna, a tartalomkérdés a bejegyzés másik, nem-kanári típusa lett — így
   mind a 2080 bejegyzéshez van valódi kulcsú kérdés. A repó kódja nem változott; a szűkítés az integrátor
   segédszkriptjével készült a meglévő export- és kulcsfájlból.
2. **Szivárgás kezelése.** A kérdésfájl tételei (`ref`, `prompt`, `options`, `example`, `exampleHu`) azonosítót és
   helyes indexet nem tartalmaznak, de a példamondatból a helyes opció a tételek kb. 90%-ánál kiolvasható (az S1
   `blindExport` szándékos alakja, a példát az `exampleOk` ítélethez adja). Ezért a megoldói szabály: **ELŐBB csak a
   `prompt` + `options` alapján válaszol, és csak utána nézi a példát** az `exampleOk` / `ageOk` ítélethez.
3. **Megoldói válasz:** `{ ref, answer: 0..3 | null, ambiguous, ageOk, exampleOk, note }` (az L2 ismétlésnél és a
   fix-körben + `chosen`: a választott opció szövege, a megoldó szkriptje `options[answer] === chosen`-t ellenőrizte).
4. **Elbírálás:** minden jelzett, nem kanári tétel (eltérő válasz, `ambiguous`, `exampleOk:false`, `ageOk:false`,
   nem üres `note`) — valódi hiba → javítás (azonosító marad) vagy azonos cellájú csere; megoldói tévedés → indoklás.
   A rendszerszintűnek látszó hibatípusokra a teljes német bankban kerestünk (szkript), és mindenhol javítottunk.
5. **Fix-kör:** a javított bejegyzésekre új export (seed 1116), ugyanazzal a szűkítéssel + 10 kanári, új független
   megoldóval.

Előzmény (a vak megoldó előtt): az integrátor szintenként ~60 bejegyzéses rétegzett szúrópróbát végzett (L4-en a
mintában 6,5% hiba miatt mind a 308 sort átolvasta), feloldotta a 11 szintek közötti term-ütközést (mindig a
nem-minta oldalt cserélve) és 11 közeli duplikátumot (névelőben / egy szóban eltérő, azonos jelentésű term).

## Eredmény

| Szint | Bejegyzés | Kérdés (q1) | Kanári | Jelzett (1. kör) | Valódi hiba | Javítva | Törölve+pótolva | Megoldói tévedés | Jelzett (utolsó kör) |
|---|---|---|---|---|---|---|---|---|---|
| L0 | 409 | 419 | 10/10 | 9 | 9 | 9 | 0 | 0 | 0 |
| L1 | 478 | 488 | 10/10 | 17 | 17 | 16 | 1 | 0 | 2 |
| L2 | 461 | 471 | 8/10 → r2: 10/10 | 15 (r2) + 2 (1. megoldó megjegyzése) | 17 | 16 | 1 | 0 | 0 |
| L3 | 424 | 434 | 10/10 | 22 | 22 | 22 | 0 | 0 | 1 |
| L4 | 308 | 318 | 10/10 | 3 | 3 | 3 | 0 | 0 | 1 |
| fix-kör | 87 | 97 | 10/10 | — | — | — | — | — | 4 (lent) |

- „Jelzett (1. kör)” a pontozó jelzései + a csak megjegyzést tartalmazó tételek (L1: `de1-culture-007`).
- **L2 első megoldó:** kanári 8/10 (a `de2-q0173` „delfin” → „das Brettspiel” és a `de2-q0232` „der Pfannkuchen” →
  „jelmez” tételnél a rontott kulcs szerinti, nyilvánvalóan hibás opciót jelölte), és 28 nem-kanári tételnél tért el a
  kulcstól sávosan (6–8., 25–29., 57–76., 116–118., 186–189., 315–319. tétel) — indexcsúszás. Indexeit nem használtuk;
  a 8 szöveges megjegyzését tájékoztató jelzésként bíráltuk el (6 egybeesett az r2 jelzéseivel; a Thermometer és a
  Viertel tételt külön javítottuk). Új, független megoldó (r2, `chosen` mezővel) → kanári 10/10, 15 jelzés.
- **Fix-kör** (97 tétel = 87 javított bejegyzés + 10 kanári): kanári 10/10, a pontozó 2 tételt jelzett, további 2
  megjegyzés (az egyik egy kanári-tétel bejegyzéséről). Mind a négy javítva — ezek **integrátori ellenőrzéssel
  zárultak**, újabb vak kör nélkül (maradó kockázat):
  - `de1-communication-005` — a 2. körben bevezetett „vezetékes telefon” jelentés túl szűk (az a Festnetztelefon), a
    fordításba is bekerült → a bejegyzés cseréje: `die Adresse` — „cím (lakcím)” — „Die Adresse steht auf dem Brief.”
    (a das Handy / telefon kétértelműség így megszűnik);
  - `de3-body-001` — „Mir tut der Muskel im Bein weh.” → „Mir tut ein Muskel im Bein weh.” (alt: Muskel);
  - `de4-home-008` — „die Heizung aufdrehen” B2-höz túl könnyű → „in den eigenen vier Wänden” — „a saját otthonában”;
  - `de1-health-009` — hu „kötés” többértelmű → „kötés (sebre)”.

## Jelzett tételek (azonosító — hiba — javítás)

### L0
- `de0-everyday-017` — „Viszontlátásra, holnapig!” tükörfordítás — „Viszontlátásra, holnap találkozunk!”
- `de0-body-020` — a „will” kimaradt a fordításból — „Köszönésképpen kezet akarok nyújtani neked.”
- `de0-freetime-009` — „Das Hobby macht mir Freude.” ↔ „hobbim” — „Mein Hobby macht mir Spaß.” (alt: Hobby)
- `de0-nature-009` — „Der Mond ist heute voll / A hold ma tele van” — „Der Mond leuchtet hell am Himmel.”
- `de0-feelings-007` — „Das Baby muss weinen.” értelmetlen kényszer — „Das Baby weint laut.” (alt: weint)
- `de0-time-022` — hu „holnapig” félrevezető (elköszönés) — hu „viszlát holnap”, „Viszlát holnap, szia!”
- `de0-body-012` — „Der Bauch ist voll / A has tele van” — „Mein Bauch ist voll. / Tele van a hasam.” (alt: Bauch)
- `de0-technology-002` — das Handy: a „telefon” opció (das Telefon) is védhető — a partner-bejegyzés javítva (fix-kör után: das Telefon → die Adresse)
- `de0-nature-007` — „kék és tág” — „kék és végtelen”

### L1
- `de1-body-020` — visszaható részeshatározó hiányzik — „Du musst dir die Nase putzen.”
- `de1-body-017` — „Der Ellbogen ist blau.” ↔ „A könyököm” — „Mein Ellbogen tut weh. / Fáj a könyököm.” (alt: Ellbogen)
- `de1-body-005` — „Ich muss mir noch die Haare kämmen.” (mir)
- `de1-food-021` — „Der Joghurt ist mit Erdbeeren.” természetellenes — „Ich esse einen Joghurt mit Erdbeeren. / Epres joghurtot eszem.”
- `de1-family-011` — „wollen … Besuch bekommen” + pontatlan fordítás — „Am Sonntag werden wir Besuch bekommen. / Vasárnap vendégünk jön.”
- `de1-numbers-013` — „tizenhárom éves” — „tizenhároméves”
- `de1-city-023` — a „wollen” kimaradt — „Este át akarunk sétálni a városon.”
- `de1-numbers-003` — „ötven éves” — „ötvenéves”
- `de1-family-001` — „tíz éves” — „tízéves”
- `de1-food-025` — „szépen forró” tükörfordítás — „jó forró”
- `de1-numbers-015` — „nyolcvan éves” — „nyolcvanéves”
- `de1-body-002` — „Der Hals ist rau.” ↔ „a torkom” — „Mein Hals ist heute rau. / Ma karcos a torkom.” (alt: Hals)
- `de1-culture-007` — hu „ünnepet ünnepel” nehézkes — „ünnepséget tart”
- `de1-clothes-022` — hu „megpróbálja a cipőt” — „felpróbálja a cipőt”
- `de1-freetime-011` — hu „barátokat találkozik” nyelvtani hiba — „barátokkal találkozik”
- `de1-communication-016` — „a levélben áll” tükörfordítás — „Az információ benne van a levélben.”
- `de1-shopping-013` — „bolt”: der Laden / der Supermarkt / das Geschäft egyaránt védhető — csere: `der Kiosk` — „újságosbódé”

### L2 (r2 + az első megoldó megjegyzései)
- `de2-numbers-001` — „Das Dutzend hat zwölf Stück.” — „Ein Dutzend sind zwölf Stück. / Egy tucat tizenkét darab.” (alt: Dutzend)
- `de2-numbers-006` (1. megoldó) — „Das Viertel einer Pizza” — „Ein Viertel der Pizza reicht mir.” (alt: Viertel)
- `de2-health-008` (1. megoldó) — das Thermometer = hőmérő általában — hu „hőmérő, lázmérő”
- `de2-city-016` — „Kérem” + tegező felszólítás — „Kérlek, csak zöldnél kelj át az úton.”
- `de2-travel-010` — „schaukelt” ≠ „hintázik” — „A csónak ringatózik a vízen.”
- `de2-communication-017` — „Mama kann uns zum Essen rufen.” — „Mama wird uns gleich zum Essen rufen. / Anya mindjárt hív minket enni.”
- `de2-family-007` — „öt éves” — „ötéves”
- `de2-family-017` — „wie die Mutter aussehen” birtokos nélkül — csere: `aussehen wie` — „úgy néz ki, mint” — „Lisa möchte später einmal so aussehen wie ihre Mutter.”
- `de2-weather-012` — „ködös van” — „Reggel gyakran ködös az idő.”
- `de2-body-013` — „haját kell mosni” — „Ich muss mir jeden zweiten Tag die Haare waschen. / Minden második nap meg kell mosnom a hajam.”
- `de2-animals-011` — „watschelt” ≠ „átbotorkál” — „A pingvin átkacsázik a jégen.”
- `de2-animals-004` — ugyanaz — „A liba átkacsázik az udvaron.”
- `de2-nature-003` — „úton vagyunk a természetben” — „Szívesen kirándulunk a természetben.”
- `de2-time-011` — „Die Mitternacht ist…” — „Es ist schon lange nach Mitternacht. / Már rég elmúlt éjfél.” (alt: Mitternacht)
- `de2-freetime-006` — „Das Schach ist…” — „Schach ist ein Spiel zum Nachdenken.” (alt: Schach)
- `de2-travel-021` — „sonst könnt ihr den Zug verpassen” — „sonst werdet ihr den Zug verpassen”
- `de2-feelings-007` — „Die Kinder wollen vor Freude springen.” logikátlan — „Die Kinder werden vor Freude springen. / … ugrálni fognak örömükben.”

### L3
- `de3-animals-012` — „A tigris kihalással fenyegetett.” — „A tigrist a kihalás fenyegeti.”
- `de3-health-016` — „receptet kiállít” tükörfordítás — hu „receptet felír”, „Az orvos felírhat neked egy receptet.”
- `de3-sports-001` — „Die Kondition ist…” birtokos nélkül — „Nach dem Winter ist meine Kondition schlecht.” (alt: Kondition)
- `de3-health-017` — „kurz” ≠ „röviden” — „Gyorsan meg kellene mérnünk a lázat.”
- `de3-communication-002` — „A megértés angolul jól megy.” — „Angolul jól megy a kommunikáció.”
- `de3-numbers-002` — „Das Drittel der Arbeit” — „Ein Drittel der Arbeit ist schon geschafft.” (alt: Drittel)
- `de3-everyday-002` — „Die Gewohnheit hilft ihr…” — „Diese Gewohnheit hilft ihr… / Ez a szokás…” (alt: Gewohnheit)
- `de3-animals-013` — „mühsam” ≠ „nehezen kell” — „fáradságosan kell”
- `de3-body-001` — birtokos/névelő — 1. kör: „Mir tut der Muskel im Bein weh.”; fix-kör: „Mir tut ein Muskel im Bein weh.”
- `de3-communication-015` — „nem meri ellentmondani” — „Soha nem mer ellentmondani a tanárnak.”
- `de3-culture-016` — hiányzó névelő — „Für Schüler ist der Eintritt frei.”
- `de3-time-003` — „Das Jahrhundert endet…” — „Dieses Jahrhundert endet im Jahr 2100.” (alt: Jahrhundert)
- `de3-family-001` — „Die Vorfahren stammen…” — „Meine Vorfahren stammen… / Az őseim…” (alt: Vorfahren)
- `de3-clothes-013` — hu „cipőt befűz” (más jelentés) — „beköti a cipőjét”
- `de3-health-001` — „felépül”: sich erholen / genesen egyaránt védhető — hu „erőre kap, kipiheni magát”, „Az influenza után erőre kell kapnia.”
- `de3-work-017` — „illetékes a pénztárért” vonzathiba — „Ki felel a pénztárért?”
- `de3-freetime-014` — „lelkesek a cirkusztól” — „el vannak ragadtatva a cirkusztól”
- `de3-feelings-020` — „sich freuen auf” — „Minden gyerek előre örülhet a szünetnek.”
- `de3-work-007` — „Az állás sajnos már betöltött.” — „Az állást sajnos már betöltötték.”
- `de3-clothes-010` — „Van meg a nadrág…” — „Megvan a nadrág…”
- `de3-food-001` — „Die Zutat für den Kuchen…” + szóismétlés — „Eine Zutat für den Kuchen fehlt noch. / Még hiányzik egy hozzávaló a süteményhez.” (alt: Zutat)
- `de3-shopping-014` — „das Fahrrad auf Raten zahlen” — „Man kann auch auf Raten zahlen. / Részletre is lehet fizetni.”

### L4
- `de4-travel-008` — stornieren: a „töröl” opció (löschen) is védhető — a partner hu-ja „töröl (adatot, fájlt)”
- `de4-culture-008` — die Fabel ≠ „mese” — „A tanmese műfaja nagyon régi.”
- `de4-food-001` — „A vas tápanyag…” — „Der Nährstoff Eisen ist in vielen Gemüsesorten enthalten. / A vas mint tápanyag…”

## Rendszerszintű javítások (teljes német bank, szkriptes keresés)

A jelzett tételeken felül 19 bejegyzés + 2 kétértelműség-partner:

- **„N éves” különírás → egybeírás** (5 jelzett + 4): `de0-numbers-007`, `de0-numbers-010`, `de0-communication-012`, `de4-culture-010`.
- **Visszaható részeshatározó testápolásnál** (2 jelzett + 4): `de0-body-015` („mir die Zähne”), `de0-body-016` („uns … die Hände”), `de2-body-013`, `de2-body-014`.
- **Határozott névelős kezdés ↔ magyar birtokos személyjel** (a „Der Hals… / a torkom” típus; jelzetteken felül 5): `de0-body-002` („Mein Auge ist rot.”), `de1-family-002` („Meine Cousine…”), `de2-body-003` („Mir tut die Zehe weh…”), `de2-body-005` („Über der Augenbraue…”), `de2-body-006` („Mein Nacken…”).
- **Kimaradt módbeli segédige a fordításban** (jelzetteken felül 5): `de2-freetime-021`, `de2-everyday-011`, `de3-sports-016`, `de3-colors-005`, `de4-culture-023`.
- **Névelő nélküli általános főnév** (jelzetteken felül 1): `de0-sports-001` („Sport ist gesund und macht Spaß.”).
- **Kétértelmű válaszlehetőség partnere:** `de1-communication-005` (das Telefon; a fix-kör után die Adresse), `de3-technology-013` (löschen → „töröl (adatot, fájlt)”).
- Átnézve, hiba nélkül: „watschelt”, tegező/magázó keverés, értelmetlen „kann/wollen” akaratlan cselekvésnél — csak a már jelzett tételek voltak hibásak.

## Záró állapot

- `report --lang de`: `total 2080`, szintenként L0 409 / L1 478 / L2 461 / L3 424 / L4 308, `phrase 748 (36.0%)`,
  kvóta-hiány nincs, phrase-kvóta hiány nincs, terv 4.2 minimum teljesül, `hibák: 0`.
- Közeli duplikátum-keresés (névelő/birtokos nélkül azonos vagy +1 szó): 18 pár, mind eltérő jelentésű (pl. „zu Hause” — „zu Hause bleiben”).
- `de/stage.ts` → `"full"` (K.8.8).

## Maradó kockázat

- Anyanyelvi (német és magyar) lektorálás nem történt (terv 8.); a minőséget modellek ítélték meg.
- A fix-kör utáni 4 javítás integrátori ellenőrzéssel zárult, újabb vak kör nélkül.
- A megoldó elvben elérhette volna a repó fájljait (utasítással tiltva, technikailag nem zárva ki).
- A kérdésfájl példamondatából a helyes opció többnyire kiolvasható; a „előbb prompt + opciók” szabály ezt csak
  mérsékli. A vak kör ezért elsősorban a példamondatok, a fordítások és a kétértelmű opciók hibáit fogja meg, a
  term–hu párosítás hibáit gyengébben.
- A szűkítés miatt bejegyzésenként csak egy kérdéstípus futott vakon; a többi típus (pl. hiányos mondat) disztraktorait
  a generátor futásidőben választja, ezeket vakon nem ellenőriztük.
