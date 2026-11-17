# Osztály a tananyag címénél és a keresőben (FIX, kanban #116)

**Állapot:** folyamatban – 2026-11-17, ág `fix/tananyag-cim-osztaly`
Végrehajtási utasítás: [`2026-11-17-tananyag-cim-osztaly-vegrehajtas.md`](2026-11-17-tananyag-cim-osztaly-vegrehajtas.md)

## A tulajdonos hibajelentése (szó szerint, 2026-11-17)

> „A tananyagokhoz továbbra sem ad hozzájuk osztálymegnevezést, az osztály számozását a címekhez. Így nehezebb a keresés, amikor a
> tananyagok közt keresünk.”

## Előzmény — miért „továbbra sem”

- 2026-11-16, kanban #54 (`docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md`, PR #459, #465, #468): az évfolyam JELVÉNYKÉNT került a
  kártyákra (főoldalon a borítókép sarkában csip, adminban jelvény a cím alatt). A #54 jegyzete szerint akkori döntés: „elég a
  kártya-felirat (címek nem módosulnak)”.
- Ami NEM készült el: (1) a CÍM szövege mellett / előtt nincs osztály — a cím a nyers `html_files.title`; (2) a főoldali kereső az
  osztályra nem keres (`client/src/lib/home-views.ts:44-48`: cím, leírás, tantárgynév), ezért csak azt találja, aminek a tárolt címében
  véletlenül benne van; (3) az új tananyagok tárolt címébe a gyártás nem ír osztályt (az a spec nem-célja és nyitott döntése volt).

## A felmérés tényei

### Éles leltár (egyetlen névtelen `GET /api/html-files`, csak olvasva, 2026-11-17)

- 245 tananyag (lecke 241, HTML 3, PDF 1). Érvényes `classroom` (egész 0–12): **245**; hiányzó / érvénytelen: **0**.
- Évfolyamonként: 0 (programozás): 8 · 2.: 1 · 3.: 27 · 4.: 57 · 5.: 52 · 6.: 23 · 7.: 5 · 8.: 49 · 9.: 23.
- A tárolt CÍMBEN szerepel az osztály: 133 (elején 79, végén 36, közepén 15; alakok: „N. osztály” 110, „N. osztályos” 17, egyéb 3);
  a címből hiányzik: **112**; a cím és a mező ellentmond: 2.
- A mostani főoldali kereső találati aránya (a lista másolatán, a jelenlegi illesztéssel): „5. osztály” → 28 / 52; „8. osztály” →
  36 / 49; „4. osztály” → 31 / 57; „5.o” → 0 / 52; „5 osztaly” → 1 / 52; „ötödik” → 2 / 52; „programozás” → 2 / 8.
- Az éles főoldal (böngészőben, csak olvasva): a kártya borítóján a csip „4. osztály”, a cím alatta a nyers cím.
- A tételes lista (azonosító, cím) a nyilvános repóba nem kerül.

### Felületek (fájl:sor az `origin/main` b4b84db6 állapotán, `source/` alatt)

| # | Felület | Fájl:sor | A cím forrása | Osztály látszik? | A keresés találja az osztályt? |
|---|---|---|---|---|---|
| 1 | Főoldal, tananyagkártya | `client/src/components/UserFileList.tsx:199,212` | `html_files.title` | csip a borítón (`classroom`), a címnél nem | **nem** (`lib/home-views.ts:44-48`) |
| 2 | Főoldal, „A legújabb tananyagaid” | `client/src/components/WelcomeCard.tsx:193-195` | `html_files.title` | igen (külön felirat a cím előtt) | nincs kereső |
| 3 | Admin „Tananyagok” kártya | `client/src/components/FileCard.tsx:105-106` | `html_files.title` | jelvény a cím alatt | részben: csak a pontos „N. osztály” feliratra (`AdminFileDashboard.tsx:160-165`), ékezet nélkül / „5.o” / „ötödik” nem |
| 4 | Tananyagjavító választó | `client/src/components/LessonRepairWorkbench.tsx:77-79` | `html_files.title` | igen (a cím alatt) | igen (`lib/lesson-repair-search.ts:22-36`: szám + „osztály…” szó) |
| 5 | Okosítás választó / táblázat | `client/src/components/MaterialImprover.tsx:525,598-599` | `html_files.title` | igen („Cím (N. osztály)”, külön oszlop) | nincs kereső |
| 6 | Okosítás mentései | `client/src/components/MaterialImprovementBackups.tsx:182-184` | a mentés `title` mezője | igen (külön oszlop) | nincs kereső |
| 7 | Stúdió piszkozatlista | `client/src/components/studio/DraftLessons.tsx:137-138` | a futás címe | igen (a cím mellett) | nincs kereső |
| 8 | Stúdió tudástérkép-választó | `client/src/components/studio/LessonStudioPanel.tsx:256` | tudástérkép `title` | kézi „N. o.” (0-nál „0. o.”) | nincs kereső |
| 9 | Admin megtekintési napló | `client/src/pages/admin.tsx:1054,1066` | `html_files.title` | igen (külön oszlop) | nincs kereső |
| 10 | Szülői nézet, megtekintett anyagok | `client/src/components/ParentDashboardPanel.tsx:329` | a válasz `title` mezője | **nem** | nincs kereső |
| 11 | Tanulói eredmények | `client/src/components/LearnersPanel.tsx:126` | az eredmény `title` mezője | **nem** | nincs kereső |
| 12 | Lecke-oldal, előző / következő súgó | `client/src/pages/Preview.tsx:187,191` | `html_files.title` | nem (a lecke fejléce mutatja az évfolyamot — #468) | nincs kereső |
| 13 | PDF-nézet | `client/src/pages/pdf-view.tsx:112,135` | `html_files.title` | igen (külön jelvény) | nincs kereső |
| 14 | „Új tananyag” levél tárgya | `server/resend.ts:154` | `html_files.title` | **nem** | — |
| 15 | Napi emlékeztető tárgya | `server/daily-reminder.ts:209` | a lecke címe | **nem** | — |
| 16 | PDF-megjelenítő lap `<title>` | `server/routes.ts:3125` | `html_files.title` | **nem** | — |
| 17 | Böngészőfül-cím | `client/index.html:11` | állandó („WebSuli - Tananyagok”) | nem (nincs lapcím-állítás a kliensben) | — |
| 18 | Játékok anyagválasztója, kuponok | játékfájlok | — | NEM VIZSGÁLT (nyitott PR-ok módosítják, ez a munka nem nyúl hozzájuk) | — |

## Cél

1. A tananyaglistákon (főoldal, admin „Tananyagok”) a CÍM SZÖVEGE előtt álljon az osztály („5. osztály · Törtek összeadása”,
   programozásnál „Programozás · …”), a `classroom` mezőből, a tárolt cím módosítása nélkül.
2. A főoldali és az admin kereső az osztályra is találjon: „5”, „5.”, „5.o”, „5. o.”, „5 osztaly”, „5. osztályos”, „5. évfolyam”,
   „5-ös”, „ötödik”, „ötödikes”, „programozás”, „prog” — kis-nagybetűtől és ékezettől függetlenül, további szavakkal együtt is
   („5. osztály törtek”).
3. Egy közös, tiszta modul (`source/shared/material-title.ts`) adja a megjelenítendő címet és a kereső-illesztést; a felületek erre épülnek.

## Nem-cél

- A tárolt címek átírása, adatbázis-módosítás, migráció, éles adat módosítása (a „B” út — tulajdonosi döntés).
- Az új tananyagok tárolt címének gyártáskori előtagja (gyártási prompt, `pipeline-store`) — tulajdonosi döntés.
- A fenti tábla 2., 4–18. sora (a következő szeletek, lásd „Szeletek”); a játékok fájljai; a levelek tárgya.
- A meglévő évfolyam-csip / jelvény eltávolítása vagy áthelyezése; az évfolyam-szűrő gombok.
- A tananyagjavító saját keresője (`lesson-repair-search.ts`) — működik, a 2. szeletben kerülhet a közös modulra.

## Rögzített döntések

- **Formátum:** `"<osztály-felirat> · <tárolt cím>"`; a felirat a `classroomDisplayLabel` (1–12: „N. osztály”, 0: „Programozás”).
  (Tulajdonosi megerősítésre vár; a váltás egy állandó és egy függvény módosítása.)
- **Nincs duplázás:** ha a tárolt cím már megnevez osztályt (bármelyiket), előtag nincs — a cím változatlan. Ha a cím MÁS osztályt
  nevez meg, mint a mező (2 éles tétel), akkor sincs előtag: a csip / jelvény a mezőt mutatja, az eltérés így látható marad, és nem
  jön létre „3. osztály · … 2. osztály” felirat. A kereső ilyenkor a mezőre ÉS a címre is talál.
- **Érvénytelen / hiányzó `classroom`:** előtag nincs (nem találunk ki osztályt); a kereső osztály-kifejezése az ilyen anyagot nem
  találja, a szöveges keresés igen.
- **A kereső csak bővül:** minden, amit a mostani kereső megtalál (a teljes kifejezés a címben, a leírásban vagy a tantárgynévben),
  ezután is találat; az osztály-értelmezés ehhez AD hozzá. Így a „második világháború” keresés nem szűkül a 2. osztályra.
- **Osztály-értelmezés:** a keresőkifejezésből kiolvasott osztály(ok) + a maradék szavak: találat, ha az anyag osztálya a kiolvasottak
  között van ÉS minden maradék szó szerepel a megjelenített címben, a leírásban vagy a tantárgynévben.
  Tört / tizedes / tartomány része nem osztály („3/4”, „3,5”, „1-2”); 12-nél nagyobb szám nem osztály („1956”, „15”).
- **Megjelenítés a főoldali kártyán:** az előtag a címsor elején, a cím betűméretével, visszafogott színnel; a címsor 2 helyett 3 sorig
  törhet, hogy az előtag ne a cím rovására menjen. A nyers cím külön elemben marad (`.home-card-title`).

## Edge case-ek

- 0. osztály → „Programozás · Cím”; ha a címben már szerepel a „programoz…” szó, nincs előtag.
- A címben már benne van: „5. osztály - Törtek”, „Törtek (5. osztály)”, „5. osztályos törtek”, „5.osztály”, „5 osztály”, „5.o”,
  „9. évfolyam”, „ötödik osztály”, „ötödikeseknek” → nincs előtag.
- Nem osztály a címben: „Az 5 legfontosabb szabály”, „1956”, „12 pont”, „A második világháború”, „Első lépések” → van előtag.
- A cím más osztályt nevez meg, mint a mező → nincs előtag (lásd fent).
- Érvénytelen érték (13, -1, 2.5, `null`, `undefined`, `"7"`) → nincs előtag.
- Üres / csak szóköz cím → az előtag nélküli (üres) cím marad; a kártya nem áll csak előtagból.
- Több osztályhoz tartozó anyag: az adatmodell egy `classroom` értéket tárol (`shared/schema.ts:52`); a cím egy osztályt mutat. Ha a
  cím tartományt nevez meg („5–6. osztály”), az a címben megnevezett osztálynak számít → nincs előtag.
- Régi HTML / PDF anyag és Stúdió-lecke: ugyanaz a szabály (a lista mindkettőnél a `html_files` sort mutatja).
- Hosszú cím (éles maximum 120 karakter) 360 px széles kétoszlopos rácsban: a címsor 3 sor után levág (három pont), a kártyából nem lóg ki.
- Keresés: „5” önmagában → az 5. osztály anyagai és minden, aminek a szövegében „5” van (mint eddig); „0” / „prog” → programozás.

## Szeletek

- **S1 (ez a PR):** közös modul + egységtesztek; főoldali kártya (1. sor) és kereső; admin „Tananyagok” kártya és kereső (3. sor).
- **S2:** a többi lista a közös modulra: 4. (kereső is), 8. (a „0. o.” hiba), 10., 11., 12. sor.
- **S3:** szerveroldali szövegek: 14., 15., 16. sor (levéltárgy, PDF-lap címe) — a levél tárgya külső helyen jelenik meg.
- **S4 (döntés után):** új tananyagok tárolt címe / a régi címek egységesítése (a „B” út); a 17. sor (lapcím a lecke oldalán).

## EARS elfogadás

<!-- acceptance-checklist -->

- [ ] E1 WHEN a főoldal tananyagkártyái megjelennek THEN the system SHALL a cím előtt az osztály feliratát mutatni („N. osztály · ”,
  0-nál „Programozás · ”) minden olyan kártyán, amelynek érvényes az osztálya és a tárolt címe nem nevez meg osztályt.
- [ ] E2 WHEN a tárolt cím már megnevez osztályt (vagy 0. osztálynál a programozást) THEN the system SHALL a címet előtag nélkül mutatni.
- [ ] E3 WHEN az osztály érvénytelen vagy hiányzik THEN the system SHALL előtagot nem mutatni.
- [ ] E4 WHEN a látogató a főoldali keresőbe osztály-kifejezést ír („5”, „5.”, „5.o”, „5 osztaly”, „5. osztályos”, „5. évfolyam”,
  „5-ös”, „ötödik”, „ötödikes”) THEN the system SHALL az adott osztály minden tananyagát megtalálni, a tárolt címtől függetlenül.
- [ ] E5 WHEN a kifejezés osztályt és további szavakat tartalmaz („5. osztály törtek”) THEN the system SHALL az adott osztály azon
  anyagait megtalálni, amelyeknél minden további szó szerepel a címben, a leírásban vagy a tantárgynévben.
- [ ] E6 WHEN a keresés „programozás” vagy „prog” THEN the system SHALL a 0. osztály minden anyagát megtalálni.
- [ ] E7 The system SHALL minden olyan anyagot megtalálni, amelyet az eddigi kereső megtalált (a kereső csak bővül).
- [ ] E8 WHEN a kifejezés tört, tizedes, tartomány vagy 12-nél nagyobb szám THEN the system SHALL azt nem osztályként értelmezni.
- [ ] E9 WHEN az admin a „Tananyagok” fülön keres THEN the system SHALL ugyanazzal az illesztéssel keresni, és a „Nincs osztály”
  feliratra is találni; a kártya címe előtt ugyanaz az előtag áll.
- [ ] E10 WHEN a nézet 360×640, 390×844 vagy asztali THEN the system SHALL a címet és az előtagot kilógás, vízszintes görgetés és
  gombtakarás nélkül megjeleníteni.
- [ ] E11 The system SHALL a megjelenítendő címet és a kereső-illesztést egyetlen közös modulból képezni, egységtesztekkel.
- [ ] E12 The system SHALL nem módosítani adatbázist, migrációt, tárolt címet, éles adatot, gyártási promptot, játékfájlt.
