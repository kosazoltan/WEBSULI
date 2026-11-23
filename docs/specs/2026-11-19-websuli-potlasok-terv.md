# Spec: WEBSULI pótlások — a heti elmaradások teljes vertikumú pótlási terve

> Dátum: 2026-11-19 · Szerző: Claude (tervező alügynök) · Állapot: JÓVÁHAGYVA (a tulajdonos a munkát 2026-11-19-én kérte: „a
> jelenlegi javítások, fejlesztések lefutása után automatikusan az elkészült tervet hajtsd végre”; a 8. szakasz kérdéseire
> 2026-11-19 ~17:55 UTC-kor űrlapon válaszolt — a válaszok a 6. és a 8. szakaszban, a szeletek ehhez igazítva).
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md`.

## 0. Források és rögzített állapot

- **Leltár:** `docs/websuli-potlasok.md` @ `4cdd7af7` (GPT-6.2 Sol, 68 tétel P-001…P-068). A leltárfájl NEM módosul; minden
  javítás ebben a tervben van.
- **Tulajdonosi üzenetek:** a 2026-11-15 és 2026-11-19 közti 99 tulajdonosi üzenet időrendi kivonata (a munkamenet scratchpadjában,
  nem követett anyag), a hivatkozás az üzenet UTC-időbélyegével történik („T: 2026-11-19T09:02”).
- **Átadó:** a közös git-könyvtár `websuli-atadas-2026-11-19.md` fájlja („Átadó”, sorszámmal), a tananyag-oldalszál
  `00-tulajdonosi-dontesek.md` és `99-ATADAS-fo-szalnak.md` jegyzete („Oldalszál 00 / 99”).
- **Repó:** `origin/main` = `b7165a56` (fetch: 2026-11-19, ennél újabb main-commit nem volt). Nyitott PR-ok a fetch után:
  #418, #484, #486, #504, #510, #513, #517, #520. Kanban: `kanban.mjs list --repo WEBSULI` (csak olvasás).
- **Mit ellenőriztem saját kézzel (fájl:sor):** lásd a 4. szakasz „Bizonyíték / javítás” oszlopát. **Mit NEM ellenőriztem:** élő
  Render-környezeti változók (a `PLAYER_ACCOUNTS` állapotát a munkamenet-átiratból vettem), éles adatbázis, CI-futások, e2e, kapuk,
  fizetős hívások — ezek a végrehajtás saját lépései.

## 1. Cél

A tulajdonos elmúlt heti kéréseiből mindaz, ami nem került a mainre, vagy félig készült el, kerüljön be sorrendezett, önállóan
beolvasztható szeletekben — a kérés **valódi célja** szerint (nem a jegy betűje szerint), a most futó munkák megkettőzése nélkül.
A tulajdonos szemével: a gyerek telefonon olvasható, igazságos, élvezhető játékot és helyesen pontozó leckét kapjon; az adventi naptár
december 1-jére éljen; a fejlesztési lánc (kapuk, hookok, ellenőr) ne lassítsa és ne vezesse félre a munkát.

## 2. NEM cél

- A most futó munkák (3. szakasz) újratervezése; azokat csak függőségként kezeljük.
- A meglévő, jóváhagyott tervek (JÁTÉK, TGM, ADVENT) újraírása: ahol egy szeletnek ott már van lépésszintű végrehajtási utasítása,
  ez a terv csak sorrendet, függőséget és a hiányzó elfogadási pontot adja hozzá.
- Új funkció, amelyet a tulajdonos nem kért; a tulajdonos által felülírt régi döntések újraélesztése (pl. szülői regisztrációs kapu —
  T: 2026-11-16T05:58; Gemini-sor a kapukban — T: 2026-11-18T16:04).
- Éles adat törlése, történetátírás, fizetős gyártás, éles levélküldés tulajdonosi jóváhagyás nélkül.

## 3. Most futó munkák (NEM tervezzük újra — „fut”)

| Futó munka | Ág / PR | Lefedett leltártétel |
|---|---|---|
| Eredménylevél a kvízhez S1b | `fix/eredmeny-email-kviz` / #510 | P-024 (és a #137, #139 ellenőrzése, lásd T-3) |
| Audit-hook kapuindítás | `fix/audit-hook-kapuinditas` / #520 | P-045 PR-része |
| Szkriptkapuk P1 terv, merge-kapu REST | `chore/szkriptkapuk-p1-terv` / #517, `fix/merge-kapu-rest` / #513 | P-042 (P1), P-044 |
| Kockavadász telefon + perf panel | `perf/kockavadasz-telefon-gyors` / #504 | P-004 (kanban #90, #117, #123) |
| J6a Aszteroida | `feat/jatek-j6a-aszteroida-kristaly` / #486 | P-002 |
| J3a Kockavadász Rúnabánya | `feat/jatek-j3a-kockavadasz-runabanya` / #484 | P-001 (D-04 (a): új pontskála-verziókulcs a merge előtt, P-063) |
| J7b Tornádó | `feat/jatek-j7b-tornado-utelagazas` | P-003 (kanban #83, #87) |
| Szökőár téma és sebesség, nyugalom-jelző | `fix/szokoar-tema-es-sebesseg` | P-005 (kanban #129 ELLENŐRIZENDŐ, lásd G-8) |
| Hang-előmelegítés | `fix/hang-elomelegites` | P-040 |
| Advent PR-B / PR-C / S3c | `feat/advent-b-…`, `wip/advent-b-egyesites`, `feat/advent-c-felulet`, `wip/advent-c-javitas`, `feat/advent-s3c-kepek` | P-034, P-035, P-036, P-055 (kanban #154, #156, #161, #162, #170) |
| Kapugyorsítás → célzott PR-e2e | `fix/kapu-gyorsitas`, `fix/gate-pr-celzott-e2e` | P-046 része (kanban #92, #107; #115 ELLENŐRIZENDŐ) |
| Vak ellenőr futtatója (GPT-6.2 Sol) | `chore/vak-ellenor-deepseek` | P-043 |
| „Bence”-maradvány tisztítás | `chore/bence-maradvany-tisztitas` | P-048, P-067 (az ágon az `auto-review.yml` 11–12. és 94–95. sora már kimondja: a workflow nem merge-el) |
| Kitakaró-regex | `fix/kitakaro-negyzetes-regex` | P-049 (T: 2026-11-19T14:13–14:22) |
| Gépi zár (+ AGENTS.md szabály, skill) | `feat/gepi-zar` | T: 2026-11-19T16:44; kanban #113 ELLENŐRIZENDŐ |
| Időzítésfüggő tesztek | `fix/idozitesfuggo-tesztek` | kanban #205, #206 |

## 4. Tételtérkép (P-001…P-068)

Jelmagyarázat: **fut** = a 3. szakasz egyik munkája viszi · **kész** = a mainen igazolva · **szelet** = e terv szelete viszi ·
**döntés** = tulajdonosi válasz nélkül nem indulhat (8. szakasz) · **lezárva** = nem időszerű, indokkal.

| P | Valódi cél (a tulajdonos szemével) | Sors | Bizonyíték / javítás a leltárhoz képest |
|---|---|---|---|
| P-001 | A Kockavadász legyen valódi bányászjáték, ne kvízmodál. | fut #484 | a merge előtt a D-04 (a) szerint új pontskála-verziókulcs (P-063) |
| P-002 | Az Aszteroidában a lövés maga a válasz, ne megszakító kapu. | fut #486 | — |
| P-003 | A Tornádóban a kérdés a pályán dőljön el (útjelző, turbó). | fut J7b | — |
| P-004 | A Kockavadász ne akadjon kihajtott telefonon. | fut #504 | #123 a #504-ben (`93d4e213`, leltár) |
| P-005 | A Szökőár újra szökőáras legyen, olvasható kérdéssel, akadás nélkül (T: 2026-11-18T09:12). | fut | — |
| P-006 | A jobbkezes gyerek a jobb hüvelykujjával kormányozzon, a tűz bal oldalon (T: 2026-11-18T16:49). | szelet G-2 | ág `feat/joystick-jobb-kez` @ `fc012178`, nem fut |
| P-007 | A főoldalon animált, cuki maki ajánlja a 3 legújabb tananyagot, telefonon könnyen; az orra ne „lebegjen” (T: 2026-11-18T16:26, 16:30). | szelet G-3 | **A leltár célja szűk volt** („kompakt sáv”): az ág terve (`docs/specs/2026-11-18-kabala-fooldal.md` 1–13. sor) pontosan a tulajdonosi kérést valósítja meg; a `kiserlet/kabala-maki` be van olvasztva az ágba (`4a33e510`, `7f35f04f`), az orr-javítás `bc3196e0` („beágyazott orr”) — képen ELLENŐRIZENDŐ |
| P-008 | A Brain Rot a közös kupon-ismétlést használja. | **kész** | `couponRepeat.ts` törölve a #483-ban (`git log --diff-filter=D` → `a11b1b79`); a #133 doksisor kész (`2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:1470`); maradék 1 komment (#141) és a #109 visszaellenőrzése → G-4 |
| P-009 | A játék ne töltsön le fölösleges kérdésbankot, és ne adjon elavultat. | szelet T-4 | kanban #71, #149 |
| P-010 | A hibázott kuponos kérdés a menetben biztosan, kiszámítható időn belül visszajöjjön (tanulási hurok). | szelet G-1 | `questionDirector.ts:140` `LATE_RETURN_MAX = 10`, `:241` — megerősítve |
| P-011 | A Szólétra telefonon olvasható és nyelvhelyes legyen. | szelet G-21 | `WordLadderHuEn.tsx:1744` árnyék, `:808`, `:1816` `${RIVAL_NAME}t` — megerősítve; kiegészítve: K-01…K-04 |
| P-012 | A Szólétra tempója és jutalma következetes, tesztelhető legyen. | szelet G-20 (#148) | A #112 tempó / ranglista kérdést a 2026-11-18-i „azonos XP” döntés eldöntötte (leltár P-012) → a #112 maradék javaslata lezárva |
| P-013 | A Szökőár J1a után teljes játék legyen (mentőöv, főellenfél), apróhibák nélkül. | szelet G-8, G-9, G-10 | a futó Szökőár-ág után |
| P-014 | A többi játék is fejezze be a megkezdett játékhurkot (J2b, J3b/c, J6b, J7c, J8, J9). | szelet G-11…G-19 | JÁTÉK végrehajtás fejezetei (6. szakasz) |
| P-015 | A Brain Rotban legyen ellenfél és visszalopás, véletlen válasz nélkül. | szelet G-17 | kanban #88; D-09 (a): rövid megerősítés |
| P-016 | A közös motor lassú telefonon is igazságos döntési időt adjon. | szelet G-5, G-6 | kanban #86, #98, #102, #114, #134, #199 |
| P-017 | Az élő képernyők apróhibái tűnjenek el. | szelet G-4, G-7, G-8 | #178/#196–#198 a Szökőár-ág után (G-8); #64, #111 G-4; #74 G-7 (D-10 (a): álló, elmosott kép szünetben) |
| P-018 | A gyerekek 3–4-en is játszhassanak együtt, győzteshirdetéssel (T: 2026-11-16T05:36). | szelet M-1, M-5, M-6 | kanban #52, #73, #97; D-07 (a) |
| P-019 | A játékos-fiók gyűjtse a pontokat (T: 2026-11-16T05:36), a régi belépés kapcsolódjon. | szelet M-2, M-3, M-4, M-7 | **kiegészítve K-06:** a pontmentés ma a régi Google + értesítőlista feltételhez kötött (`gameScoreService.ts:47–53`, `useGameScoreSync.ts:22`) |
| P-020 | Egy postafiók ne nyithasson több ranglista-profilt. | szelet M-8 | kanban #77; D-06 (a): új regisztrációnál kanonikus egyediség, a meglévők csak listázva |
| P-021 | Az Aszteroida a kristály után legyen gyors és kényelmes (pool, vezérlés, egyujjas mód, napi seed Budapest szerint). | szelet G-15a, G-15b | kanban #85; D-08 (b): egyujjas mód IGEN (G-15b) |
| P-022 | A fiókok és a közös játék biztonságos sorrendben élesedjenek. | szelet M-1 → admin-pilot → M-5 → nyilvános | **Javítva:** a fiókokat a tulajdonos 2026-11-16-án bekapcsoltatta (T: 2026-11-16T19:57); az átirat szerint „fiókok bekapcsolva, a közös játék továbbra is kikapcsolva”. D-07 (a): `MP_MODE` admin-pilot az M-1 után, nyilvánosan a JM3b (M-5) után |
| P-023 | A nyilvános repó előzményeiben maradt címadat sorsa. | lezárva | D-14 (a): megőrizzük, nincs történetátírás (kanban #57 már `done`) |
| P-024 | A kvíz eredménye is menjen el a szülőnek, félbehagyáskor is (T: 2026-11-17T18:13). | fut #510 | — |
| P-025 | Egy kör eredménye pontosan egyszer menjen ki, hibák után se duplán / se elveszve. | szelet T-3 | kanban #127, #128, #135, #189–#191 |
| P-026 | A keresőben az osztályos keresés a ragos / tartományos alakra is működjön. | szelet T-5 | kanban #142; a főoldali megjelenítés kész (#494) |
| P-027 | A pontozó ne vegyen el pontot helyes válaszért, és ne adjon üres válaszért. | szelet T-1, T-2 | `polynomial.ts:203` a záró pontsort határnak veszi (#121), `answer-value.ts:184` `GAP_OR_NUMBER` (#122) — kód alapján megerősítve, futtatva NEM |
| P-028 | A lecke tartsa meg a forrás-PDF ábráit (T: 2026-11-18T09:53). | szelet TGM-S2b, S3a, S3b, SK1c | `source-visuals-flag.ts` alapból KI (#515) |
| P-029 | A gyártás gépileg ellenőrizze a számolást és jelezze a költséget. | szelet TGM-S4a, S4b, SK3 | D-02 (a): az SK3-ban nincs új megállító korlát |
| P-030 | A leckék ne legyenek monotonok (T: 2026-11-18T09:53). | szelet TGM-S5a…SK2 | `source/shared/variety-metrics.ts` hiányzik — megerősítve |
| P-031 | A tömör, helyes nyílt válasz fél pontot kapjon (T: 2026-11-17T19:40). | szelet TGM-S7a, S7b | — |
| P-032 | Élethű brit kiejtés a leckékben (T: 2026-11-18T09:53). | szelet TGM-#183, S8c, #150 | `audio-store.ts:8` 40 / 80 MB — megerősítve, D-01 (a) jóváhagyta |
| P-033 | A minőségjavulás mérhető, a kiadás őrzött legyen. | szelet TGM-S10/0, S10/1, SK4, SK5, S9, S10/2 | `.agents/skills/websuli-gyartas-analitika` hiányzik, a `.claude` tükör megvan — megerősítve; `source/scripts/measure/` alatt nincs `source-gap-table.mts` |
| P-034 | Az adventi haladás tartósan mentődjön. | fut PR-B | — |
| P-035 | Az adventi naptár kis képernyőn, érintéssel, billentyűzettel menjen. | fut PR-C | #162 a PR-C része |
| P-036 | Szép, klasszikus karácsonyi képek (T: 2026-11-18T09:38). | fut S3c | a képek legyártva (átirat 2026-11-18T12:32: 84 kép), a tulajdonos válogatására vár |
| P-037 | A képgyártó ne lépje túl a keretet, és megszakítás után induljon újra. | szelet A-3 | kanban #200–#203 |
| P-038 | Az advent december 1-jén éljen admin-előnézettel, takarítással, levéllel. | szelet A-1, A-2, A-4 | `shared/advent/calendar.ts:61–71` december 1-jén nyit |
| P-039 | Az elsős is tudja használni (felolvasás), a tételek ne árulják el egymást. | szelet A-5 | kanban #151, #153 |
| P-040 | Az első hangeffekt ne késsen. | fut | — |
| P-041 | A kisfilm-gyártás ne döntse be a szervert. | szelet I-2 | `lesson-clips.ts:20` `CLIP_PARALLEL = 2` — megerősítve; #418 nyitott |
| P-042 | Minden munkafázist szkript ellenőrizzen (T: 2026-11-17T11:20). | szelet Q-1, Q-6 | P1 fut (#517) |
| P-043 | A vak ellenőr független gépi futtató legyen. | fut | — |
| P-044 | A merge-kapu felhőben is fusson. | fut #513 | — |
| P-045 | A hookok ne engedjenek át és ne tiltsanak hamisan. | szelet Q-2, Q-4, Q-5 | #100, #126, #140 kész (#506, `14c859ee` címe); a többi jegy szeletben |
| P-046 | A kapuk gyorsak és pontosak legyenek. | szelet Q-3 | #92, #107 fut; #144, #168 szelet |
| P-047 | Az állapot (memória, kanban, környezet, keresés) gépileg ellenőrizhető legyen (T: 2026-11-17T12:54). | szelet Q-9 | ágak `ab69f000`, `ab87bf16` |
| P-048 | Ne maradjon félrevezető régi automatizmus. | fut | — |
| P-049 | A kitakarás nagy kimeneten se akadjon el. | fut | — |
| P-050 | A CI ne ingadozzon, és a workflow-k jogosultsága szűk legyen. | szelet Q-7, Q-8 | kanban #76, #105, #143, #204 |
| P-051 | A vezérlő anyagok és a holt kód rendben legyenek (T: 2026-11-16T05:19, 2026-11-17T07:01). | szelet I-6 | kanban #34 |
| P-052 | Futó gyártás alatt ne legyen telepítés; a szerver biztonságos legyen. | szelet I-1 | **#63 kész:** `pre-merge-gate.mjs:108–110` futásőr; **#68 kész:** `render.yaml:7` `npm ci … && npm run db:migrate && npm run build` + az átirat szerint az élő build-parancs javítva; marad #169 |
| P-053 | Kevesebb fölösleges nagy olvasás és csomag. | szelet I-3, I-4 | kanban #69, #72 |
| P-054 | Éles műveleteket determinisztikus szkript-őr korlátozzon (T: 2026-11-18T10:56). | szelet I-5 | kanban #145 (J3–J10); a J1 a TGM-SK3 |
| P-055 | A vendég-haladás párosításkor ne vesszen el. | fut PR-B | — |
| P-056 | A képválogatás és a levél a tulajdonos jóváhagyásával menjen. | fut (S3c képválogatás) + A-4 | Az S8 terve szerint az éles küldést a tulajdonos maga indítja a panelről (`2026-11-18-adventi-naptar-vegrehajtas.md` 445–446) |
| P-057 | A hook-beállítások szándéka legyen eldöntve. | szelet Q-5 | kanban #175, #185; D-13 (a): a `settings.local.json` ki a követésből, az MCP PR-eszközök a kapu-hook alá |
| P-058 | Párhuzamos munkafák bizonyítéka ne vesszen el. | szelet Q-1 | `docs/agent-csapdak.md` C-75 |
| P-059 | Régi tananyag-migráció. | lezárva | A projektmemória indexe: „lezárva 178/178” (legacy-migration-cycles); az októberi #6/#7/#15/#16 a heti körön kívül esik |
| P-060 | A háttérfolyamatok ne maradjanak árván, a fő munkakönyvtár legyen friss. | szelet Q-10 | a TaskStop-árva figyelő eszközhiba, nem repó-feladat; a fő checkout frissessége gépileg nincs ellenőrizve (a `scripts/qa/gates/` alatt nincs ilyen lépés — keresés `ff-only` / „fő checkout” szóra) |
| P-061 | A nyitott PR-szálak és a kiváltott PR-ok rendezve legyenek. | lezárva | folyamatlépés minden merge-nél (gate:merge nyitott szál ellenőrzés); #441 → #443 kiváltva |
| P-062 | Az oldalszál anyaga a fő szálba kerüljön (T: 2026-11-19T08:46). | lezárva | a teendők a TGM-szeletekben (P-028…P-033) |
| P-063 | A régi és az új Kockavadász-pontok ne keveredjenek. | fut #484 | D-04 (a): új verziókulcs, új ranglista, a régi rekordok archívként; `BlockCraftQuiz.tsx:1097,3321,3340` (leltár) |
| P-064 | A TTS két eltérése (néma próbakimondás, 80 MB) jóváhagyott legyen. | kész | D-01 (a): mindkettő jóváhagyva; a mainen él (`audio-store.ts:8`); a TGM-terv D4 / E48 pontjába az S9 vezeti át |
| P-065 | Az SK3 ne vezessen be új megállító korlátot. | szelet TGM-SK3 | D-02 (a): kimarad; Oldalszál 00:16–17 |
| P-066 | A forrásábra-kapu saját hibája `enforce` módban mit tegyen. | szelet TGM-SK1c | D-03 (a): a lecke vázlat marad + e-mail; Oldalszál 00:24–25 |
| P-067 | A review-indító ne ígérjen automatikus merge-et. | fut (Bence-ág) | döntés NEM kell: a minőségkapuk szerint merge csak gate:merge után (`docs/minosegkapuk.md` 92–95: `--auto` DENY) |
| P-068 | Kell-e külön GitHub-munkamenet. | lezárva | A tulajdonos 2026-11-19T08:46: minden a fő szálba („szűnjön meg ez a sok szana-szét fókuszált munka”) |

**Sorsok darabszáma (a 2026-11-19-i döntések után):** fut 18 · kész 2 · szelet 43 · lezárva 5 · döntésre vár 0 = 68.

## 5. A leltárból kimaradt vagy félreértett kérések (most felvéve)

| K | Kérés (forrás) | Valódi cél | Sors |
|---|---|---|---|
| K-01 | Szólétra: a válaszgombok szövegárnyéka miatt olvashatatlan (T: 2026-11-19T09:02; Átadó 25) | fehér gombon a fekete, elmosott árnyék „dupla” betűt ad — a szöveg legyen éles | G-21 (`WordLadderHuEn.tsx:1744` `${HOLD}-label` árnyéka) |
| K-02 | Haladássáv „felcserélt színei” (Átadó 26) | **Ellenőrizve a tulajdonos két képén:** a színek helyesek (Te = kék pötty a te fokodon: 8/16 → ~50%, 14/16 → ~87%; Villám = lila). A félrevezető rész: a „Te” felirat fixen balra, a „Villám” fixen jobbra áll, így a „Te” a lila, a „Villám” a kék jelölő alá kerül. Cél: a név a saját jelölőjéhez kötve jelenjen meg | G-21 (`WordLadderHuEn.tsx:1684–1695` `.wl-race-*`) |
| K-03 | „Mit jelent: „…”?” (Átadó 26) | a célszó-kiemelés (#498) a szót kiveszi a mondatból és „…”-tal pótolja; a mondat így furcsa | G-21 (D-05 (a)) |
| K-04 | „Legyőzted Villámt” → „Villámot”, minden ellenfélnévre (T: 2026-11-19T09:09; Átadó 27) | helyes magyar tárgyeset, nem `${név}t` sablon | G-21 (`:808`, `:1816`; `RIVAL_NAME` `:148`) + őr-teszt |
| K-05 | Maki a főoldalon (T: 2026-11-18T16:26, 16:30) | lásd P-007 — a leltár célja szűk volt | G-3 |
| K-06 | Pontgyűjtés a játékos-fiókban (T: 2026-11-16T05:36) — a tulajdonos győzelmi képernyőjén „Az e-mail címed nincs a WebSuli értesítő listáján” áll | a fiók bekapcsolva, de a pontmentés még a régi feltétel (Google + értesítőlista) | M-3, M-4 |
| K-07 | „Kapcsold be majd a fiókokat” (T: 2026-11-16T19:57) | a leltár „döntésre vár”-nak vette | P-022 javítva |
| K-08 | Teljes takarítás a repóban, programban, adatbázisban (T: 2026-11-18T07:06, 07:09) | az éles DB-tömörítés lefutott (átirat 2026-11-18T12:32: 350 → 235,7 MB); a „szemét ne termelődjön újra” tartós megőrzési szabály megléte ELLENŐRIZETLEN | I-5/J10 1. lépése ellenőrzi |
| K-10 | A kommunikáció leszakad (T: 2026-11-19T12:32) | üzemeltetési: zárvárakozás és figyelő; a gépi zár (fut) kezeli | lezárva |
| K-11 | Cloudflare / belépés (T: 2026-11-18T06:20–06:29) | az ok a VPN volt, DNS-hez senki nem nyúlt (átirat 06:31) | lezárva |
| K-12 | A Gemini-sor kivétele (T: 2026-11-18T16:04) | kanban #99 (Gemini nem vizsgált területei) nem időszerű; a G-A / G-B / G-C megerősített leletei érvényes hibák | #99 lezárva; #96 → M-2, #97 → M-1, #98 → G-6 |

A 2026-11-15T21:13-i videós kérés (korábban K-09) kikerült: nem WEBSULI-feladat, tulajdonos 2026-11-19.

## 6. Rögzített döntések és kényszerek (a legújabb él)

- Játékos-fiók: diák saját regisztrációja, becenév + e-mail, nincs szülői kapu (T: 2026-11-16T05:58); Google-belépés admin
  felülethez csak engedélylistáról (T: 2026-11-16T06:00); fiókok BE (T: 2026-11-16T19:57); közös játék (`MP_MODE`) KI, admin-pilot az M-1 után, nyilvánosan a JM3b után (D-07).
- Tiltott fiók lenyomata 12 hónap (T: 2026-11-16T19:39).
- Joystick marad (T: 2026-11-17T05:51), jobb kézre kerül, a tűz bal kézre (T: 2026-11-18T16:49).
- Szólétra: nyugodt tempó, azonos XP (2026-11-18, leltár P-012).
- Nyílt válasz: tömör, helyes = fél pont (T: 2026-11-17T19:40; D5 a döntőbíró-plafon, Oldalszál 00:7).
- TGM: újrarajzolás, 30 USD próbakeret, ElevenLabs, hang a DB-ben, csak leckék, éles költség csak jelez, próbakeret kemény
  (Oldalszál 00:3–10).
- Advent: 95%-os teljesítésnél „Menj oda apukádhoz…” (T: 2026-11-18T09:12); klasszikus, gazdag karácsonyi grafika (T: 09:38);
  teljes szélességű kártya a Hero és a tananyagok között (T: 09:43); címzettek csak feliratkozók és aktív extra címek
  (Kiegészítés 4); éles értesítést csak a tulajdonos indít (S8/6).
- Kapuk: `gate:stage` → `gate:push` → vak ellenőr → `gate:pr` → CI → `gate:merge` (`docs/minosegkapuk.md`); megkerülés tilos.
  A vak ellenőr a GPT-6.2 Sol futtató (`npm run gate:blind-review` — a `chore/vak-ellenor-deepseek` beolvadása után; a mainen ma
  NINCS ilyen npm-szkript, `package.json` 13–17). Addig a repóban érvényes vak, hibakereső alügynök-szabály.
- A nehéz körök (gate:push, gate:pr, e2e, DB) gépi zár alatt (`feat/gepi-zar` beolvadása után a repó zárszkriptje; addig a futó
  munkamenet zárszabálya).
- Halmozott PR-nál minden PR önállóan semleges; kapcsoló a lánc alján, alapból KI.
- **Tulajdonosi döntések 2026-11-19 (~17:55 UTC, űrlap; részletek a 8. szakaszban):** D-01 a néma próbakimondás elhagyása és a
  40 / 80 MB-os hangtár jóváhagyva · D-02 az SK3-ban nincs új megállító korlát · D-03 `enforce`-kapu saját hibájánál a lecke vázlat
  marad, e-mail megy · D-04 Rúnabánya: új verziókulcs, új ranglista, a régi rekordok archívként · D-05 Szólétra: a célszó a mondatban,
  kiemelve, a nagy kártya elmarad · D-06 alias: új regisztrációnál kanonikus egyediség, a meglévők csak listázva · D-07 `MP_MODE`
  admin-pilot az M-1 után, nyilvánosan a JM3b után · D-08 Aszteroida egyujjas mód IGEN (G-15b) · D-09 Brain Rot: rövid megerősítés ·
  D-10 szünetben álló, elmosott kép · D-11 advent BE az A-1 beolvadásával, legkésőbb november 30., a tulajdonos előnézeti próbája után ·
  D-12 maki: ellenőrzés után BE, körbevezetés csak először · D-13 `.claude/settings.local.json` ki a követésből, az MCP PR-eszközök
  a kapu-hook alá · D-14 nincs történetátírás · D-15 törölve (nem WEBSULI-feladat) · D-16 a G-21 a P1-blokk után.

## 7. Szeletek

### 7.1 Sorrend (P1 elöl)

| # | Szelet | Prio | Tételek | Függőség |
|---|---|---|---|---|
| 1 | A-1 Advent S6: admin-előnézet, 60 napos takarító, bekapcsolás | P1 | P-038, #155(S6), #172, #166, #171 | PR-B, PR-C (fut); **határidő: november 30.** A sorrendet a főterv H1 igazította: S5/S6 beolvasztása KI állapotban → előnézeti próba → tulajdonosi döntés (D-11) → külön bekapcsoló PR |
| 2 | A-2 Advent S5: eredménylevél az adminoknak | P1 | P-038, #155(S5) | PR-B |
| 3 | T-1 Pontozó: polinom végpont, két számeredmény | P1 | P-027, #121, #122 | — |
| 4 | T-2 Pontozó: igen/nem/szám rubrika, kérdés-visszamásolás | P1 | P-027, #130, #132 | T-1 (ugyanaz a korpusz) |
| 5 | I-1 Kliens-IP hamisítás | P1 | P-052, #169 | — |
| 6 | I-2 Kisfilm memória (#418 befejezése) | P1 | P-041, #35 | — |
| 7 | T-3 Eredménylevél kézbesítési szélei | P1 | P-025, #127, #128, #135, #189–#191 (+ #137, #139, ha a #510 végső fejéből hiányzik) | #510 merge |
| 8 | Q-1 Szkriptkapuk P2: bizonyítéklánc + munkafánkénti napló | P1 | P-042 (P2), P-058 | #517, #513 merge |
| 9 | Q-2 Hook-szelet 1: fail-closed bemenet és lassúság | P1 | P-045, #158–#160, #174, #176, #179, #180, #182 | #520 merge |
| 10 | Q-3 Kapu: squash-követő háromfázisú hamis bukás, lépés-időkorlát | P1 | P-046, #144, #168 | kapugyorsítás merge |
| 11 | G-21 Szólétra olvashatóság és nyelvhelyesség | P2 | P-011, K-01…K-04 | — (D-05, D-16 eldöntve) |
| 12 | A-3 Advent képgyártó utómunka | P2 | P-037, #200–#203 | minden további fizetős képkör ELŐTT |
| 13 | A-4 Advent S8 értesítő (száraz futás, tulajdonosi küldés) | P2 | P-038, P-056, #155(S8) | A-1 |
| 14 | A-5 Advent: elsős felolvasás, tételátfedés | P2 | P-039, #151, #153 | PR-C; lehetőleg december 1. előtt |
| 15 | A-6 Advent DB-kör két folyamatra | P2 | #152, #167, #173 | PR-B |
| 16 | G-1 Kupon-ismétlés felső korlátja | P2 | P-010, #108, #136 | — |
| 17 | G-2 Joystick jobb kézre | P2 | P-006 | Szökőár-ág merge |
| 18 | G-3 Főoldali maki | P2 | P-007, K-05 | — (BE csak az orr képes ellenőrzése után, D-12) |
| 19 | G-4 Élő apróhibák | P2 | P-008 maradék, P-017, #64, #109, #111, #141 | — |
| 20 | G-5 Közös motor: órák lassú képkockán | P2 | P-016, #114, #134, #199 | — |
| 21 | G-6 Közös mérő, HoldButton, kérdés-sáv költség | P2 | P-016, #86, #98, #102 | G-5 |
| 22 | G-7 Szünet alatti rajzolás | P2 | P-017, #74 | — |
| 23 | G-8 Szökőár utómunka | P2 | P-013, P-017, #94 (ÚA3, ÚA4), #129 (ha maradt), #178, #186, #196–#198 | Szökőár-ág merge |
| 24 | G-9 J1b, G-10 J1c | P2 | P-013 | G-8 |
| 25 | G-11 J2b | P2 | P-014 | G-21 |
| 26 | G-12 J3b, G-13 J3c | P2 | P-014, #93 (J3c) | #484 merge (a D-04 szerinti verziókulccsal) |
| 27 | G-14 J6b, G-15a Aszteroida K.4, G-15b egyujjas mód | P2 | P-014, P-021, #85 | #486 merge; G-15b a G-15a után |
| 28 | G-16 J7c | P2 | P-014, #104 | J7b merge |
| 29 | G-17 J5b | P2 | P-015, #88 | G-1 |
| 30 | G-18 J8 meta-fejlődés | P2 | P-014 | M-4 |
| 31 | M-1 Közös játék előfeltétele: 3–4 fős kilépés, G-B leletek | P2 | P-018, #73, #97 | — |
| 32 | M-2 JM7c-2 + tiltás-holtpont + G-A leletek | P2 | P-019, #62, #75, #96 | — |
| 33 | M-3 JM8a pontkönyv (szerver), M-4 JM8b (kliens) | P2 | P-019, K-06 | M-2 |
| 34 | M-5 JM3b, M-6 JM4–JM6, M-7 JM9–JM11 | P2 | P-018, P-019, #52 | M-1 + az `MP_MODE` admin-pilot (tulajdonosi flag-lépés); a nyilvános bekapcsolás az M-5 után |
| 35 | M-8 Alias-egyediség | P2 | P-020, #77 | — |
| 36 | T-4 Kérdésbank S2–S3 | P2 | P-009, #71, #149 | — |
| 37 | T-5 Tananyagkereső szélei | P2 | P-026, #142 | — |
| 38 | TGM-lánc (S2b … S10/2, 23 alszelet) | P2 | P-028…P-033 | 7.6 szerint |
| 39 | Q-4 Hook-szelet 2: hamis tiltások, PowerShell, alias | P2 | P-045, #124, #125, #177, #192–#195 | Q-2 |
| 40 | Q-5 Hook-szelet 3: runbook, szöveg-őr, ConfigChange, MCP | P2 | P-045, P-057, #120, #164, #175, #181, #184 | Q-4 |
| 41 | Q-6 Szkriptkapuk P3–P5 | P2 | P-042, #187, #188 | Q-1 |
| 42 | Q-7 CI ingadozók gyökéroka | P2 | P-050, #76, #105, #143, #204 | — |
| 43 | Q-8 Workflow-jogosultság, SHA-rögzítés, szeletsúlyok | P2 | P-050 | — |
| 44 | Q-9 Állapot-ellenőrzők (a, b) | P2 | P-047, #103 | Q-1 |
| 45 | I-3 Perf: Vercel gyorsítótár / előnézet; I-4 nagy olvasások | P2 | P-053, #69, #72 | T-4 |
| 46 | I-5 Futásidejű szkript-őrök J3–J10 (8 alszelet) | P2 | P-054, #145, K-08 | 7.9 szerint |
| 47 | G-19 J9 záró mérés és átfogó review | P2 | P-014 | az összes G-szelet |
| 48 | G-20 Szólétra pacing.ts szétválasztása | P3 | P-012, #148 | G-21 |
| 49 | Q-10 Fő checkout frissesség-ellenőrzés | P3 | P-060 | — |
| 50 | I-6 Vezérlés-diéta 2. lépcső | P3 | P-051, #34 | — |

A G-21 a P1-blokk után áll (11. hely) — D-16 (a), 2026-11-19. A tulajdonos 2026-11-19T09:02-i „sor vége” kérése a most futó
munkákra vonatkozott.

### 7.2 Advent (A-1…A-6)

**A-1 — S6: admin-előnézet, takarító, bekapcsolás.** Részletes lépések: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`
„S6” (313–341. sor) a „Kiegészítés 5” felülírásával (az előnézet nem függ a flagtől, cím `/adventi-naptar?elonezet=…`).
- Cél: december 1-jén (`shared/advent/calendar.ts:61–71`) a naptár éljen, az admin előre megnézhesse bármely napot, és a 60 napos
  megőrzés gépileg teljesüljön.
- Nem cél: értesítő levél (A-4), új kérdések, képcsere (S3c fut).
- Fájlok (a PR-B / PR-C ágon jönnek létre, a mainen még nincsenek): `source/server/advent/routes.ts`, `source/server/advent/sweeper.ts`
  (minta: `source/server/player/sweeper.ts`), `source/client/src/advent/useAdvent.ts`, `source/client/src/pages/AdventCalendar.tsx`,
  `render.yaml`, `source/tests/admin-route-guard.test.ts`, `source/tests/advent-calendar.spec.ts`.
- Kiegészítés ebből a tervből: #172 — a flag nem kapcsolhat be a takarító bekötése nélkül (őr-teszt: a `render.yaml`
  `ADVENT_CALENDAR=on` csak akkor, ha a sweeper indítása a szerver indulási útján van); #171 — kikapcsolt flagnél a CSRF nélküli POST
  403, az E21 szövege igazítva; #166 — bejelentkezett játékos útja böngészőben (az e2e-szerveren a `PLAYER_ACCOUNTS` bekapcsolásával
  az adott specben, vagy HTTP-szinten indokolt NOT RUN).
- Edge: előnézet érvénytelen dátummal (400); nem admin (401/403); a takarító e2e-módban nem indul; több példány (a korlát
  példányonként számol — megjegyzés a `render.yaml`-ban).
- EARS: WHEN az admin az `?elonezet=2026-12-05` címet nyitja THEN a naptár a december 5-i állapotot mutatja; WHEN a flag BE
  THEN a szerver indulásakor és 24 óránként fut a `store.sweep`; WHEN nem admin kéri az előnézetet THEN 401/403 és nincs mellékhatás.
- Ellenőrzés: `admin-route-guard.test.ts`, `advent-calendar.spec.ts`, `test:learning-db` (gépi zárral), mobil 360×640 és 844×390.
- Kockázat: a flag bekapcsolása éles viselkedés. Sorrend (a főterv H1, `docs/specs/2026-11-23-foterv.md`, felülírja a korábbi „a
  bekapcsolás az A-1 beolvadásával” megfogalmazást; a tulajdonosi jóváhagyás feltétele változatlan): az A-1 KI állapotban olvad be (a
  `render.yaml` nem változik) → a tulajdonos az előnézetben megnézi → D-11 jóváhagyás → külön, egysoros bekapcsoló PR, legkésőbb
  november 30-án.

**A-2 — S5: eredménylevél.** Részletek: ugyanott „S5” (290–311. sor) + „Kiegészítés 5”. Cél: a végigért kör eredménye eljusson a
címzettekhez egyszer. EARS (az adventi terv 18.1-e szerint, `docs/specs/2026-11-18-adventi-naptar.md`): WHEN egy `learner` alany eredménye VÉGLEGES — (1)
megfelelt, (2) az utolsó megengedett körben mind a 24 ablak megválaszolt és nincs javítható ablak, vagy (3) az évad lezárult és
legalább egy ablakra válaszolt — THEN évadonként és címzettenként pontosan egy levél megy idempotencia-kulccsal (`final:<cím-lenyomat>`);
WHILE a három véglegesítő feltétel EGYIKE SEM teljesül THEN levél NEM megy (a `finished_at` beállása önmagában NEM feltétel). Teszt:
23 megoldott + 1 javítható (megfelelt) → egy levél; 22 + 2 javítható évadzárás előtt → nincs levél, évadzáráskor → egy levél;
a levél után újabb válasz → nincs második; WHEN a küldés bukik THEN a foglalás felszabadul és pótolható; `preview` / `device` alanynál soha. Ellenőrzés:
`test:learning-db`, `no-real-emails-guard.test.ts`. Kockázat: valódi küldés tesztben — csak hamis küldővel (`NODE_ENV === "test"`).

**A-3 — Képgyártó utómunka.** Cél: a 7 USD-os keret valóban kemény legyen, és Ctrl+C után ne kelljen kézzel zárfájlt törölni.
Fájlok: `source/scripts/design-assets/generate.ts`, `source/scripts/design-assets/lib.ts`, `source/tests/advent-art-pipeline.test.ts`.
Tételek: #200 (a következő kép várható ára + eddigi tényleges ≤ keret, különben megáll), #201 (`generateOne` végponttól végpontig
injektálható `fetch`-csel), #202 (`--ref` létezés előre, `media_type` nélküli válasz, a zár a napló olvasása előtt), #203 (SIGINT /
SIGTERM elengedi a zárat; halott pid-ű zár visszavehető). EARS: WHEN a következő kép a keretet túllépné THEN a futás a hívás előtt
megáll, kilépési kód ≠ 0; WHEN a folyamat SIGINT-et kap THEN a `.run.lock` törlődik. Ellenőrzés: egységteszt mockolt `fetch`-csel,
fizetős hívás NINCS. Függőség: minden további éles képkör előtt.

**A-4 — S8 értesítő.** Részletek: ugyanott „S8” (416–447. sor), Kiegészítés 4 szerint `includePlayers` NINCS, `recipient_hash` HMAC.
EARS: WHEN az admin száraz futást kér THEN a válasz darabszámot és előnézetet ad, nem ír és nem küld; WHEN a `confirmCount` eltér
THEN 409. Kockázat: éles küldés — az ügynök nem indítja; a tulajdonos a panelről.

**A-5 — Elsős felolvasás és tételátfedés.** Cél: az elsős is megértse a kérdést; a koszorús tételek ne adják meg egymás válaszát.
Fájlok: `source/shared/advent/christmasBank/` (a #151 hét tétele, az `xmas-065` ↔ `xmas-007`), `source/shared/advent/christmas-validate.ts`,
a PR-C kérdésnézete (felolvasó gomb a meglévő böngészőhang-lánccal: `source/shared/speech-chain.ts`). EARS: WHEN 1. évfolyamos alany
nyit ablakot THEN a kérdés mellett felolvasó gomb van, hang nélküli eszközön a gomb rejtett vagy jelzi a hiányt; WHEN a validátor fut
THEN két tétel válasza nem szerepel egymás kérdésében. Ellenőrzés: `advent-christmas-bank.test.ts`, böngészős kör 360×640.

**A-6 — DB-kör két folyamatra.** Cél: a helyi DB-integrációs kör ne fusson a 480 s-os korlát szélén. Nem cél: a korlát emelése (#167
csapda). EARS: WHEN a `test:learning-db` fut THEN két független folyamatban, egyenként a korlát 70%-a alatt (terheletlen gépen mérve).

### 7.3 Tananyag és pontozó (T-1…T-5)

**T-1 — Pontozó: polinom végpont, két számeredmény (#121, #122).**
- Cél: a „10x…” / „10x..” / „10x …” helyes válasz kapjon pontot (54 éles feladat, kanban #121), a „30 · 7 210” két külön szám legyen
  (13 éles feladat, #122).
- Nem cél: a tizedespont és a valódi ezres tagolás („12 000”) viselkedésének változása.
- Fájlok: `source/shared/polynomial.ts` (203. sor: a `.(?=\s|$)` a záró pontsort határnak veszi), `source/shared/answer-value.ts`
  (184. sor `GAP_OR_NUMBER`), `source/shared/arithmetic-expression.ts` (10. sor `NUM`), `source/tests/fixtures/scorer-corpus.json`,
  `source/tests/scorer-corpus.test.ts`.
- Edge: „2.5x” tizedes; „10x.” mondatzáró pont; „12 000” egy szám; „30 · 7 210”; Unicode „…”.
- EARS: WHEN a válasz a helyes polinom és utána 1–3 pont vagy „…” THEN a pontozó a teljes pontot adja; WHEN két szám egy szóközzel
  áll műveleti jel után THEN két szám; WHEN „12 000” áll THEN egy szám marad.
- Ellenőrzés: korpusz pozitív és negatív párokkal (szintetikus feladatok), `scorer-corpus.test.ts`, mutációs ellenpróba (a javítás
  visszavonására a teszt bukik).
- Kockázat: a közös kiértékelő a kliens `isPlayableQuestion`-jét is érinti (`arithmetic-expression.ts` 1–5. sor) — a
  `single-choice-check` tesztjei is futnak.

**T-2 — Pontozó: rubrika és visszamásolás (#130, #132).** Cél: a „nem tudom” ne kapjon fél pontot, a „hát” ne illeszkedjen a „hat”-ra,
a kérdés szövegének visszamásolása ne adjon rubrika-találatot. Fájlok: `source/shared/lesson-experience-score.ts` (rubrika-illesztés;
a 254. sor körüli szabály), a korpusz. Edge: valódi rövid igen/nem válasz; ékezet ≠ ékezet nélküli szó; a kérdés szavát
tartalmazó, de új információt adó válasz. EARS: WHEN a válasz csak a kérdés szavait ismétli THEN 0 pont; WHEN „nem tudom” THEN 0
pont; WHEN „hat” a helyes szám THEN „hát” 0 pont. Ellenőrzés: korpusz + mutációs ellenpróba. Kockázat: túlszigorítás — a #509 rövid
válasz tesztjei (`open-answer-short.spec.ts`) változatlanul zöldek.

**T-3 — Eredménylevél kézbesítési szélei.** Cél: egy kör eredménye pontosan egyszer menjen ki, a „félbehagyva” levél se írja felül a
véglegeset. Fájlok: `source/server/lesson-result-email.ts`, `source/server/resend.ts`, `source/tests/learning-db.integration.ts`.
Tételek: #189 (a véglegesítési jelző érvényessége = a pillanatkép-fogadás ablaka, 7 nap), #190 (jelzőírás-hiba után ne menjen
„félbehagyva”), #191 (dedikált kulcstér a jelzősornak), #128 (kézbesített, de elveszett válasz: a szolgáltatói idempotencia-kulcs
újrapróbával), #127 (`errorClass` a három régi naplósorban), #135 (több példány: a várakozó levél ne csak egy folyamat memóriájában
éljen — vagy dokumentált `numInstances: 1` őr), továbbá #137 / #139, ha a #510 végső fejében nincsenek meg. Edge: óraátállás,
újraindítás a két levél között, azonos iskolai IP két tanulóval. EARS: WHEN a véglegesítés 1–7 nap után érkezik THEN „félbehagyva”
levél nem megy; WHEN a szolgáltató időtúllépést ad, de kézbesített THEN az újrapróba ugyanazzal a kulccsal megy, a címzett egy levelet
kap. Ellenőrzés: óravezérelt egység- és DB-teszt (gépi zárral). Kockázat: az atomi foglalás (#495) változatlan marad.

**T-4 — Kérdésbank S2–S3 (#71, #149).** Részletek: `docs/specs/2026-11-17-kerdesbank-karcsusitas.md` S2–S3. Cél: anyag létrehozása /
törlése érvénytelenítse az évfolyam-változat lenyomatát; a lenyomat-lekérdezés olcsó. Fájlok: `source/server/gameQuizBankService.ts`,
`source/server/lib/conditional-get.ts`. EARS: WHEN új anyag jön létre THEN a következő kérés új ETag-et kap.

**T-5 — Kereső szélei (#142).** Fájl: `source/shared/material-title.ts` (102–108. sor: tartomány és képző). EARS: WHEN a keresés
„5-ös” THEN úgy szűr, mint „5. osztály”; WHEN „5-6. osztály” THEN mindkét osztály; WHEN „2 vagy több” THEN nem osztály-keresés.
Ellenőrzés: `home-views.test.ts` és a kereső egységtesztje.

### 7.4 Kapuk és QA (Q-1…Q-10)

**Q-1 — Szkriptkapuk P2: bizonyítéklánc + munkafánkénti napló.** Részletek: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md`
és párja (a #517 egységesített változata), forrás az ág `chore/szkriptkapuk-p2-bizonyitek-lanc` @ `9d68cbfa`. Kiegészítés: C-75 —
a napló fejhez ÉS munkafához kötött útvonalon (`<git-common-dir>/websuli-qa-evidence/logs/<munkafa>/<fej>/…`), forgatással. EARS:
WHEN két munkafa egyszerre fut kaput THEN a két napló nem írja felül egymást; WHEN a lánc egy bizonyítéka hiányzik THEN a következő
kapu FAIL. Ellenőrzés: `scripts/qa/gates/*.test.mjs`.

**Q-2 — Hook-szelet 1.** Fájlok: `scripts/qa/hooks/check-quality-gates.mjs`, `scripts/qa/hooks/check-audit-ok.mjs`,
`scripts/qa/hooks/check-destructive.mjs`, `scripts/qa/hooks/enforce-repo-rules.mjs`, tesztjeik (`check-quality-gates.test.mjs`,
`hook-failure.test.mjs`, `settings-hooks.test.mjs`). Tételek:
#158, #160, #176 (nem objektum / nem szöveg / escape-elt bemenet → tiltás kapu-köteles műveletnél), #159 (ismeretlen eszköz → a
kapu-hookkal azonos döntés), #174 (nem WEBSULI-könyvtárból indított láncolt alak), #179 (a három lassú regex lineáris; kitöltött
parancson a 15–20 s-os külső korlát alatt), #180 (a korlát exportálva, nem forrássorból olvasva), #182 (`xit\(` szóhatárral). EARS:
WHEN a hook-bemenet érvénytelen JSON-alakú THEN kapu-köteles parancsra DENY; WHEN 100 000 karakteres parancs érkezik THEN minden hook
1 s alatt dönt. Ellenőrzés: `settings-hooks.test.mjs`, `hook-failure.test.mjs`, `check-quality-gates.test.mjs`.

**Q-3 — Kapu: squash-követő és időkorlát (#144, #168).** Fájlok: `scripts/qa/three-phase-check.mjs` (+ teszt),
`scripts/qa/gates/lib.mjs` (lépés-futtató). EARS: WHEN a követő ág egy már squash-olt PR-ra épül THEN a mainen már tartalmilag jelen
lévő commitok nem buktatják a háromfázisú ellenőrzést; WHEN egy lépés túllépi a saját korlátját THEN a kimenet „IDŐTÚLLÉPÉS <s>”,
nem „kilépési kód 127”. Előfeltétel: a kapugyorsítás beolvadása (ugyanazokat a fájlokat érinti).

**Q-4 — Hook-szelet 2: hamis tiltások.** Tételek: #124 (kapcsos kifejtés git-paraméterben — e terv írásakor is előfordult), #125 (`-R`
normalizálás), #177 (`git stash push`, `git log --grep push`), #192–#195. EARS: WHEN `git log --format={a,b}` THEN nincs tiltás;
WHEN `gh pr merge -R https://github.com/<tulaj>/WEBSULI.git` THEN a WEBSULI-ra vonatkozó szabály fut.

**Q-5 — Hook-szelet 3.** D-13 (a): a `.claude/settings.local.json` kikerül a követésből (`git rm --cached` + `.gitignore`-sor; a
helyi fájl megmarad), a GitHub-MCP PR-nyitó / -összevonó eszközök a kapu-hook alá kerülnek (a hook-kód kezeli az MCP-bemenetet; a
`.claude/settings.json` matcher-sorát a tulajdonos alkalmazza). Tételek: #120 (args-os hook-alak), #164 (szöveg-őr a teljes runbookra és az öt kapu-skillre),
#175 (MCP-eszközök a matcherben a döntés szerint), #181 (ConfigChange hook), #184 (runbook-pontosítás). A `.claude/settings*.json`
szerkesztése ügynöknek tiltott (`docs/minosegkapuk.md` 205–208): az ügynök a módosítást a PR-ban javaslatként adja, a beállítást a
tulajdonos alkalmazza.

**Q-6 — Szkriptkapuk P3–P5.** Előbb #187 (a „< 10%” → „≤ 10%”) és #188 (a tolerance-changed csak lazításnál lelet), utána a terv
P3–P5 sorrendje; forrás a `chore/kapu-ingadozo` @ `f98dfc42`, `chore/kapu-allitas-ellenor` @ `82ea5b1a`, `chore/kapu-teszt-integritas`
@ `f894999e` kódja. A figyelmeztetésről tiltásra váltás a terv 6.3a feltételeihez kötött.

**Q-7 — CI ingadozók.** Tételek: #105 (`vocab-cross-game-log.spec.ts:49`, `remaining-learning.spec.ts:74`), #143
(`block-craft-real-touch.spec.ts:66`), #204 (Vihargarázs 915×412 meta-mérő 20,8 perc), #76 maradéka. Szabály: előbb a terhelt futás
elkülönítése a termékhibától; tesztet gyengíteni tilos. EARS: WHEN a spec tízszer fut terheletlen gépen THEN 10/10 zöld.

**Q-8 — Workflow-jogosultság, SHA-rögzítés, súlyok.** Fájlok: `.github/workflows/ci.yml`, `.github/workflows/auto-review.yml`,
`scripts/qa/e2e-shards.mjs`, `scripts/qa/e2e-shard-weights.json`. EARS: minden workflow-ban job-szintű legszűkebb `permissions`;
minden külső action teljes commit-SHA-val; minden spec súlyozva (új spec súly nélkül → FAIL). A Bence-ág (fut) után.

**Q-9 — Állapot-ellenőrzők.** (a) `chore/allapot-ellenorok` @ `ab69f000`: memory-check, kanban-check, env-doctor; (b)
`chore/kapuk-beepites` @ `ab87bf16`: termék-kereső aranykészlet, CI-őr, git pre-push hook, Codex-beállítás, skill. EARS: WHEN a
kanban-check fut THEN a `review`-ban ragadt és a mainen már kész jegyeket listázza (pl. e terv 4. szakaszának „kész” jegyei).

**Q-10 — Fő checkout frissesség.** Cél: a hookok a fő checkoutból futnak; elavult main = elavult hook (projektmemória). EARS: WHEN a
`gate:push` vagy `gate:merge` fut és a fő checkout HEAD-je ≠ `origin/main` THEN WARN a pontos paranccsal (`git pull --ff-only`).

### 7.5 Játékok (G-1…G-21)

**G-1 — Kupon-ismétlés felső korlátja (#108, #136).** Fájl: `source/client/src/game-engine/play/questionDirector.ts` (140., 241. sor).
Cél: a hibázott tétel 8 és 10–12 tételes leckénél is legkésőbb N kérdés múlva visszajöjjön (N a specben rögzítve, a #108 mérése:
80 seedből 14–43 eset nem jön vissza). EARS: WHEN egy kuponos tételre hibás válasz jön THEN 80 seed minden esetében legfeljebb
`RETURN_MAX + LATE_RETURN_MAX` kérdésen belül újra előkerül, ha a menet addig tart. Ellenőrzés: seedelt egységteszt (8, 10, 12 tétel),
lejárt kupon + hibás válasz együtt.

**G-2 — Joystick jobb kézre.** Forrás: `feat/joystick-jobb-kez` @ `fc012178` (terv az ágon: `docs/specs/2026-11-18-joystick-jobb-kez.md`
— ELLENŐRIZENDŐ). Cél: joystick jobbra, tűz / akció bal oldalra minden joystickos játékban. Edge: álló és fekvő nézet; a Szökőár súgója
(#178) ne lógjon a tárcsa alá. EARS: WHEN joystickos játék indul THEN a tárcsa a jobb alsó, az akciógomb a bal alsó sávban van,
átfedés nélkül 360×640, 844×390, 827×896 nézetben. Ellenőrzés: `game-touch-controls.test.ts`, valódi érintéses böngészős kör.

**G-3 — Főoldali maki.** Forrás: `feat/kabala-fooldal` @ `80f4c6cc` (terv: `docs/specs/2026-11-18-kabala-fooldal.md`). Teendő:
friss main beolvasztása, az orrfolt képes ellenőrzése (a tulajdonosnak képernyőkép), a D-12 (a) válasz átvezetése a terv 10. szakaszába (bekapcsolás az orr ellenőrzése után, körbevezetés csak először),
kapuk. EARS: WHEN a főoldal betölt és `HOME_MASCOT` BE THEN a maki a 3 legújabb (évfolyamhoz illő) tananyagot ajánlja, a képkészlet
≤ 300 KB, a CLS nem nő; WHEN `prefers-reduced-motion` THEN álló kép. Kockázat: a 250 KB-os célt az ág 6,7 KiB-tal túllépi (terv
105–107. sor) — a keret 350 KB, ezen belül.

**G-4 — Élő apróhibák.** Tételek: #64 (Viharvadász buborék fekvőben, Brain Rot „Elszökött!” feliratok, Kockavadász nyitókamera — a
jegy szövege szerint), #111 (Neon: a drón alatti fosztogató miatt a koppintás lövés lesz — `SpeedQuizMath.tsx`, `pointerTap.ts`),
#141 (a `returnCapReached` kommentje, `source/tests/brainrot-sim.test.ts:182`), #109 (a két Brain Rot teszt — `brainrot-play.spec.ts`
— visszaellenőrzése; ha zöld, a jegy zárva). Minden tételnél előbb reprodukció, utána javítás. EARS: WHEN a gyerek a kérdés-drónra
koppint THEN válasz születik, nem lövés.

**G-5 — Közös motor: órák (#114, #134, #199).** Fájlok: `source/client/src/game-engine/play/clock.ts`, `flow.ts`, `loop.ts`,
`questionUi.ts`. EARS: WHEN a képkocka 4 fps THEN a kérdés döntési ideje legfeljebb 5%-kal tér el a 60 fps-es értéktől; WHEN a
director burkolt ablakot ad THEN a flow / intensity a burkoltat látja.

**G-6 — Közös mérő és HoldButton (#86, #98, #102).** Fájlok: `HoldButton.tsx`, `InlineQuestion.tsx`, `source/tests/game-mobile-quality.spec.ts`.
EARS: WHEN a HoldButtont az ujj elhagyja vagy a lap elveszti a fókuszt THEN felenged; WHEN a mérő 827×896 és 896×827 nézetben fut THEN
a főszál-blokk játék közben < 50 ms/s.

**G-7 — Szünet alatti rajzolás (#74).** D-10 (a): szünetben a 3D és a díszítő háttér nem rajzol; az utolsó képkocka álló, elmosott
képként marad. EARS: WHEN a szünet menü nyitva THEN a képkocka-számláló nem nő, és a háttér elmosott álló kép. Fájl: `source/client/src/game-engine/mobile/index.ts` (`requestGameFrame`).

**G-8 — Szökőár utómunka.** A Szökőár-ág beolvadása után: #94 ÚA3 (tétlen átfutásnál 0-t mutató időzítő), ÚA4 (kapu előtti
takarítás látható akadályt tüntet el), #196 (betöltés közbeni csupasz jelenet), #197 (a figura negyede kilóg álló nézetben), #186 /
#198 (4× CPU első kérdés-képkocka ≤ 100 ms, tüske ≤ 200 ms — profilozás), #178 és #129, ha a futó ág nem zárta le (1. lépés:
ellenőrzés az ág végső fején).

**G-9…G-19 — A játékhullám maradéka.** Részletes lépések és elfogadás: `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`
— J1b (1116), J1c (1129), elfogadás J1 (1143); J2b (1220), elfogadás (1233); J3b (1296), J3c (1307), elfogadás (1317); J5b (1650),
elfogadás (1665); J6b (1726), elfogadás (1736); J7c (1855), elfogadás (1890); J8 (1904), elfogadás (1952); J9 (1978), elfogadás (2003).
Kiegészítés: G-15a = kanban #85 K.4 pontjai (pool, InstancedMesh, 4× CPU, kétujjas teszt, jelvényszöveg, napi seed Budapest szerint —
óraátállás-teszttel; a balkezes tükrözés a G-2 jobbkezes döntése után nem készül, mert a tulajdonos fix jobbkezes elrendezést kért);
G-15b = egyujjas mód (D-08 (b), 2026-11-19) — lásd lent;
G-13 = #93 J3c-pontja (fekvőben a kérdés alá eső kövek); G-17 = D-09 (a): a megállással adott válasz rövid megerősítést kér
(második koppintás vagy rövid tartás) — EARS: WHEN a játékos megáll egy lény előtt THEN válasz csak a megerősítés után születik. Minden G-szelet a C-61…C-72 csapdák 1–6. hibatípusára célzott tesztet kap
(`docs/minosegkapuk.md` 150–157).

**G-15b — Aszteroida egyujjas mód (D-08 (b), 2026-11-19).**
- Cél: az Aszteroida egy ujjal is játszható legyen (mozgás és célzás egy érintéssel, automata tüzeléssel), úgy, hogy az automata
  tüzelés ne adjon véletlen választ a kérdés-kristályokra.
- Nem cél: a kétujjas mód viselkedésének változása; új kérdéstípus.
- Fájlok: `source/client/src/pages/SpaceAsteroidQuiz.tsx` és a #486-tal jövő `crystals.ts`, `physics.ts`, `sim.ts` (a pontos útvonal
  a #486 beolvadása után ELLENŐRIZENDŐ), `source/tests/game-mobile-cases/space-asteroid-quiz.ts` (leltár P-002).
- Rögzített szabály: egyujjas módban az automata tüzelés találata a kérdés-kristályon NEM válasz; válasz csak tudatos célzással
  születik (pl. a kristály a célzás közepén van egy minimális ideig, vagy külön koppintás a kristályra) — a pontos jelet a szelet
  terve méréssel rögzíti.
- Edge: kristály akadály mögött; több kristály egymás mellett; a kérdés megjelenésekor már lenyomott ujj; lejárt kupon; fekvő és
  álló nézet; módváltás menet közben.
- EARS: WHEN egyujjas módban az automata tüzelés a kristályt eltalálja, de a játékos nem célzott rá tudatosan THEN válasz nem
  születik; WHEN a játékos a kristályt a terv szerinti jellel tudatosan célozza THEN pontosan egy válasz születik; WHEN az ujj már a
  kérdés megjelenése előtt le volt nyomva THEN válasz csak felengedés és új célzás után születhet; WHEN a kétujjas mód fut THEN a
  viselkedése változatlan (a meglévő tesztek zöldek).
- Ellenőrzés: seedelt sim-teszt (80 menet automata tüzeléssel, tudatos célzás nélkül → 0 válasz), böngészős egyujjas érintéses kör
  360×640 és 844×390 nézetben, mutációs ellenpróba (a tudatos-célzás feltétel kivétele → a teszt bukik).
- Függőség: #486, G-15a. Kockázat: a minőségkapuk 1. hibatípusa (véletlen válasz) — a vak ellenőr kifejezett megtörési pontja.

**G-20 — Szólétra `pacing.ts` (#148).** A tárolás külön fájlba, a tiszta időzítés a determinizmus-őr alá, a hamis fejkomment javítva.

**G-21 — Szólétra olvashatóság és nyelvhelyesség.**
- Cél: telefonon éles válaszgomb-szöveg; a haladássávon a név a saját jelölőjénél; természetes kérdésmondat; helyes tárgyeset.
- Nem cél: tempó, XP, 3D-mód.
- Fájlok: `source/client/src/pages/WordLadderHuEn.tsx` (148: `RIVAL_NAME`; 808, 1816: `${RIVAL_NAME}t`; 1684–1695: `.wl-race-*`;
  1744: `${HOLD}-label` árnyéka), `source/client/src/lib/wordLadder/focus.ts` (célszó-kiemelés), új őr-teszt
  `source/tests/hu-accusative-guard.test.ts`.
- Edge: hosszú név; 3D kérdésmód (`data-quiz3d="true"`, 1795. sor: ott a szöveg átlátszó); egyenlő állás; célszó nélküli kérdés.
- EARS: WHEN a gyerek legyőzi vagy megelőzi az ellenfelet THEN a felirat a név helyes tárgyesetét mutatja („Villámot”) a
  `{ név, tárgyeset }` párból; WHEN bármely kliensfájlban `${…}t!` / `${…}ot!` sablonos tárgyrag áll THEN az őr-teszt FAIL; WHEN a
  válaszgomb világos háttéren áll THEN a szövegen nincs sötét elmosott árnyék (WCAG AA kontraszt mérve); WHEN a haladássáv
  kirajzolódik THEN a „Te” és a „Villám” felirat a saját jelölője közelében áll (a jelölő vízszintes helyéhez kötve); WHEN a kérdésnek
  célszava van THEN a szó a mondatban marad, kiemelve (D-05 (a)), a nagy külön kártya nem jelenik meg, és „„…”” helyőrző nincs.
- Ellenőrzés: `word-ladder-readability.spec.ts` bővítése (360×640, 844×390 és kihajtott 827×896, dpr 2,625 — a tulajdonos képernyőképének mérete), képernyőkép a
  tulajdonosnak; őr-teszt mutációs ellenpróbával.
- Kockázat: a #498 célszó-kiemelés tesztjei.

### 7.6 Tananyaggyártás (TGM-lánc)

Részletes lépések: `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` (fejezetsorok zárójelben). Sorrend és kiegészítés:

1. S2b (355) — döntési fa, képes kártya.
2. S3a (419), S3b (509) — a forrás és az ábrák állomás összekötése, szókeret / szerző / lektor / bank.
3. S4a (544), S4b (572) — számolási hamis riasztások, idézet-áthelyezés, zárt világ-lista.
4. SK3 (602) — D-02 (a): új megállító korlát nincs; a spec SK3 szakaszát előbb az Oldalszál 00:10 szerint igazítani („csak jelez”, nincs vészleállító).
5. S10/0 (667) — `source-gap-table.mts`, `trial-ledger.mts`, fixture-ök.
6. S10/1 (689) — fizetős első mérés ≤ 30 USD, eldobható DB-n (D2 döntés megvan); indítás előtt a futásőr.
7. SK1c (kanban #163) — az S10/1 valódi kimenetével; D-03 (a): `enforce` módban a kapu saját hibájánál a lecke vázlat marad (nem
   publikálódik), és e-mail megy az adminoknak; az ismert lefedettségi bukás bukás marad.
8. S5a (741), S5b (773), S6a (795), S6b (829), S6c (850), SK2 (873).
9. S7a (904), S7b (950) — #131.
10. #183 (8 lelet), majd S8c (1060) — az ElevenLabs-gyártás tulajdonosi indítással (Oldalszál 99 4. szakasz: ~3,4 USD), előtte
    valódi iPad / Android próba; #150 a tartaléklánc.
11. SK4 (1225), SK5 (1253).
12. S9 (1272) — kiegészítés: a `.agents/skills/websuli-gyartas-analitika/SKILL.md` forrás pótlása a `.claude` tükörből
    (skills-sync-check), a D-01 (a) jóváhagyás átvezetése a D4 / E48 pontba (Oldalszál 00:18–20).
13. S10/2 (729) — záró mérés; utána a `STUDIO_SOURCE_VISUALS` bekapcsolási kérdése a tulajdonosnak a mért számokkal.

### 7.7 Többjátékos mód és fiók (M-1…M-8)

Részletek: `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` — JM3b (2360), JM4a/b/c (2371), JM5a–d (2388), JM6 (2400),
JM7c (2762), JM8a (2842), JM8b (2884), JM9 (2894), JM10 (2911), JM11 (2921).

- **M-1:** #73 (3–4 fős szobában a visszavágó közbeni kilépés után a maradók beragadnak: `source/shared/duel/room-machine.ts` — a
  jegy 558. és 853. sora) + #97 G-B leletek (b03 F1–F3, b04 F01–F09, a visszaellenőrzött listából). EARS: WHEN egy játékos kilép a
  visszavágó alatt THEN a maradók szobája új visszavágót indíthat, vagy érthető üzenettel zárul. Az `MP_MODE` admin-pilot ELŐTT
  kötelező (kanban #97).
- **M-2:** JM7c-2 (#62: régi, nem admin `users` sorok kapcsolása a játékos-profilhoz, a régi `/auth/google` ne írjon nevet / képet,
  a nyilvános Belépés a játékos-útra), #75 (`account-store.ts` unbanDeleted / deleteAccount holtpont), #96 G-A leletek.
- **M-3 / M-4:** JM8a/b pontkönyv `PLAYER_POINTS` flag mögött. Kiegészítés K-06: játékos-fiókkal belépett gyereknél a menet vége a
  pontkönyvbe kerül; az eredménykártya „nincs az értesítő listán” szövege (`useGameScoreSync.ts:22`, `TsunamiEscapeEnglish.tsx:858`)
  játékos-fióknál nem jelenik meg. EARS: WHEN játékos-fiókkal belépett gyerek befejez egy menetet THEN a pont a fiókjában
  megjelenik, és az eredménykártya ezt mondja.
- **M-5…M-7:** a terv sorrendjében; a győzteshirdetés csoportban a tulajdonos 2026-11-16-i kérése.
- **M-8:** D-06 (a): új regisztrációnál a Gmail-cím kanonikus alakja (pont és +címke nélkül) egyedi; a meglévő ütközéseket csak
  listázzuk az admin-panelen, automatikus összevonás és visszafordíthatatlan adatlépés nincs. EARS: WHEN egy már regisztrált
  postafiók alias-címével új regisztráció érkezik THEN elutasítás érthető üzenettel; WHEN a migráció fut THEN a meglévő ütköző
  fiókok változatlanok és listázva vannak.

### 7.8 Infrastruktúra (I-1…I-6)

**I-1 — Kliens-IP (#169).** Fájl: `source/server/lib/client-ip.ts` (a Vercel-út a 17. sor `x-websuli-proxy-secret` titokfejlécével
igazolt; a 66–67. sor viszont `RENDER === "true"` mellett a `cf-connecting-ip`-et igazolás nélkül fogadja el). Cél: ha a
Render-szolgáltatás a Cloudflare / Vercel megkerülésével közvetlenül elérhető, a fejléc ne legyen hamisítható (kéréskorlát- és
keret-kijátszás). A megoldást a szelet terve választja ki mért bizonyítékkal (pl. a Cloudflare-út is igazolt jelhez kötve, vagy a
közvetlen Render-elérés elzárása — utóbbi éles beállítás, tulajdonosi teendő); a meglévő titokcsere-eszköz:
`scripts/qa/set-proxy-secret.mjs`. EARS: WHEN a kérés nem megbízható proxyn át
érkezik és `CF-Connecting-IP` fejlécet hoz THEN a fejléc figyelmen kívül marad. Ellenőrzés: szintetikus egységteszt. Éles
konfigurációhoz nem nyúl az ügynök; ha éles beállítás kell, az a PR-ban tulajdonosi teendő.

**I-2 — Kisfilm (#418).** A nyitott PR friss mainre hozása, kapuk, vak ellenőr, merge. Az első éles memóriamérés a PR-leírás
kikapcsolási feltételével, a kisfilm-kapcsoló engedélyezett visszakapcsolása után.

**I-3 — Perf #69:** `source/vercel.json` `no-store` ne írja felül a design-assets gyorsítótárát; a Vercel-előnézetek ne az éles API-t
hívják. **I-4 — Perf #72:** `GET /sitemap.xml` és a többi „mindent beolvas” végpont (kanban #72) célzott lekérdezéssel.

**I-5 — Futásidejű szkript-őrök J3–J10 (#145).** Alszeletek: J3 Resend-webhook (aláírt visszapattanás / panasz), J4 telepítés utáni
füstpróba, J5 borító-újrapróba tartós számlálója, J6 fejlesztői USD-plafon, J7 éles írásőr, J8 push-e2e (a kapugyorsítással
egyeztetve), J9 döntőbíró-indoklás szűrése, J10 éjszakai invariáns-söprés — az 1. lépése K-08: az éles adatbázis megőrzési
szabályainak leltára (mely tábla nő korlát nélkül), csak olvasva. Minden őrhöz előre a termék-belépő és a szintetikus szerződéses teszt.
A Resend és az éles adat külön tulajdonosi felhatalmazást igényel.

**I-6 — Vezérlés-diéta 2.** `docs/specs/2026-11-17-vezerles-dieta.md` 2. lépcső; kanban #34 (holt kód, függőségek, régi márkanév,
VPS-doksik).

## 8. Tulajdonosi döntések (megválaszolva 2026-11-19 ~17:55 UTC, űrlapon)

| D | Kérdés | Opciók (az ajánlott elöl) | Indok | Döntés (2026-11-19) |
|---|---|---|---|---|
| D-01 | A brit hang két, már élesben lévő eltérését jóváhagyod? | **(a) Igen, mindkettőt** (néma próbakimondás nélkül; hangtár 40 MB hangverziónként + 80 MB abszolút) · (b) csak a 80 MB-ot, a próbakimondás visszajön · (c) egyiket sem — visszaállítás 40 MB-ra | a mainen fut (`audio-store.ts:8`); a 80 MB a hangcsere átmeneti kettős készlete, nélküle hangcsere közben a feltöltés megállna | **(a)** igen, mindkettő |
| D-02 | Az SK3-ban maradjon ki az új futásidő- és összesített körszám-megállító? | **(a) Igen, maradjon ki** · (b) legyen, de csak jelezzen · (c) legyen megállító | összhangban a 2026-11-18-i „csak jelezzen, vészleállító nem kell” döntéssel | **(a)** maradjon ki |
| D-03 | Ha a forrásábra-kapu maga hibázik `enforce` módban, mi legyen? | **(a) A lecke vázlatként marad, nem jelenik meg; e-mail megy** · (b) a gyártás megáll · (c) csak e-mail, a lecke megjelenik | kapu-hiba nem engedhet ellenőrizetlen leckét a gyerekhez, de pénzt sem dob ki (a kész gyártás megmarad) | **(a)** vázlat marad + e-mail |
| D-04 | A Rúnabánya új pontskálájánál mi legyen a régi Kockavadász-rekordokkal? | **(a) Új verziókulcs: új ranglista, a régi rekordok megmaradnak archívként** · (b) nullázás · (c) közös lista átváltással | visszafordítható; nincs adatvesztés; a két skála nem összevethető | **(a)** új verziókulcs, új ranglista, a régi archív |
| D-05 | A Szólétra kérdésében a kiemelt szó hogyan álljon? | **(a) A szó a mondatban marad, kiemelve (sárga címkeként); a nagy kártya elmarad** · (b) marad a nagy kártya, a mondat „Mit jelent ez a szó?” · (c) mindkettő | természetes mondat, és a kiemelés (#498 cél) megmarad | **(a)** a szó a mondatban, kiemelve; a nagy kártya elmarad |
| D-06 | Egy Gmail-postafiók alias-címei (pont, +címke) nyithassanak-e külön játékos-fiókot? | **(a) Nem: új regisztrációnál kanonikus cím-egyediség; a meglévő ütközéseket csak listázzuk, te döntesz** · (b) igen, maradjon így · (c) a meglévőket is automatikusan összevonjuk | a ranglista-duplikálás megszűnik, és meglévő fiókhoz automatikusan nem nyúlunk | **(a)** új regisztrációnál kanonikus egyediség; a meglévők csak listázva |
| D-07 | Mikor induljon a közös (online) játék? | **(a) Admin-pilot az M-1 (kilépési hiba + G-B leletek) után, nyilvánosan a JM3b után** · (b) maradjon KI a játékhullám végéig · (c) azonnal admin-pilot | a jegy szerint a G-B leletek javítása a pilot előfeltétele | **(a)** admin-pilot az M-1 után, nyilvánosan a JM3b után |
| D-08 | Az Aszteroidában készüljön külön egyujjas mód? | **(a) Most nem; a J6a visszajelzése után újra** · (b) igen, a G-15-ben | a forrás szerint az automata tüzelés véletlen válaszokat okozhat | **(b)** IGEN — egyujjas mód a G-15b-ben, a véletlen válasz kizárásával (csak tudatos célzás válaszol) |
| D-09 | A Brain Rotban a megállással adott válasz kérjen-e megerősítést? | **(a) Igen, rövid megerősítés (második koppintás / tartás)** · (b) hosszabb megállási küszöb · (c) marad | a mért önkéntelen válasz a minőségkapuk 1. hibatípusa | **(a)** rövid megerősítés |
| D-10 | Szünet alatt a 3D háttér rajzolódjon tovább? | **(a) Ne: álló, elmosott kép szünetben** · (b) lassítva fusson · (c) maradjon így | akkumulátor, és a szünet valódi szünet | **(a)** álló, elmosott kép szünetben |
| D-11 | Mikor kapcsoljuk be az adventi naptárat élesben? | **(a) Az A-1 beolvadásával, legkésőbb november 30-án, a te előnézeti próbád után** · (b) december 1-jén reggel · (c) csak az S3c végleges képei után | december 1-jén nyílik az első ablak | **(a)** az A-1 beolvadásával, legkésőbb november 30-án, a tulajdonos előnézeti próbája után |
| D-12 | A főoldali maki bekapcsolása és körbevezetése? | **(a) A végleges modell + az orrfolt képes ellenőrzése után BE; körbevezetés csak először** · (b) BE most · (c) KI marad | a terv 10. szakaszának ajánlásai; nem idegesítő a visszatérőnek | **(a)** ellenőrzés után BE, körbevezetés csak először |
| D-13 | A követett `.claude/settings.local.json` szándékos-e, és a GitHub-MCP eszközök kerüljenek-e a kapu-hook alá? | **(a) Nem szándékos: kivenni a követésből; az MCP PR-nyitó / -összevonó eszközök a kapu-hook alá** · (b) szándékos marad; MCP kívül · (c) szándékos; MCP a hook alá | a kapu ma csak Bash / PowerShell-t lát (kanban #175) | **(a)** a `settings.local.json` ki a követésből; az MCP PR-eszközök a kapu-hook alá |
| D-14 | A nyilvános git-előzményben maradt régi címadat? | **(a) Megőrizzük, nincs történetátírás** (a követett fájlok már tiszták, őr-teszt véd) · (b) szervezett történetátírás force-pusszal | a már klónozott másolatokat az átírás sem törli; force-push minden ágat és PR-t érint | **(a)** megőrizzük, nincs történetátírás |
| D-15 | — | — | — | **törölve:** nem WEBSULI-feladat, tulajdonos 2026-11-19 |
| D-16 | A Szólétra-javítás (árnyék, tárgyrag, haladássáv) hol álljon a sorban? | **(a) A P1-blokk után** · (b) a teljes terv végén | felhasználói hiba, rövid szelet; a „sor vége” a most futó munkákra vonatkozott | **(a)** a G-21 a P1-blokk után |

## 9. Közös edge case-ek és kockázatok

- Minden UI-szelet: valódi böngészős kör 360×640, 844×390 és kihajtott nézetben; átfedés, levágás, vízszintes görgetés mérve.
- Időzóna: minden napváltás Europe/Budapest (advent, napi seed, levél-ablakok), óraátállás-teszttel.
- Halmozott ág: minden PR önmagában semleges élesben; kapcsoló alapból KI.
- Kockázat: sok párhuzamos szelet ugyanazokat a közös fájlokat érinti (`questionDirector.ts`, hookok, `pre-*-gate.mjs`) — a
  7.1 függőségei sorba rendezik; őr-érintő PR saját merge-ablakban (C-61).
- Visszavonás: minden szelet egy squash-commit; revert önállóan lehetséges; a flagek (advent, maki, forrásábra, pontkönyv) KI-re
  állíthatók.

## 10. Elfogadás (a terv egészére)

<!-- acceptance-checklist -->
A repóban nincs `npm run qa:spec`; a jelölő a meglévő tervek (ADVENT) szokását követi.

- [ ] WHEN a végrehajtás befejeződött THEN a 4. szakasz minden „szelet” sora mögött beolvasztott PR áll (szám + merge-commit).
- [x] WHEN a tulajdonos a 8. szakasz kérdéseire válaszolt THEN a válasz dátummal bekerült a 6. és 8. szakaszba, és a szeletek
  ehhez igazodtak (2026-11-19).
- [ ] WHEN egy „fut” munka beolvad THEN a tételtérkép sora „kész”-re vált a merge-commit hash-ével.
- [ ] WHEN a kanbanon egy jegy a 4. szakasz szerint kész (#31, #63, #68, #95, #99, #100, #106, #126, #133, #140, #165) THEN a jegy
  lezárul a bizonyíték hivatkozásával.
- [ ] WHEN az A-1 beolvad THEN legkésőbb november 30-án az adventi naptár élesben BE (D-11 (a), a tulajdonos előnézeti próbája után).
- [ ] WHEN a G-21 beolvad THEN a tulajdonos telefonos képernyőképén a 4 tünet (K-01…K-04) nem látható.
- [ ] WHEN bármely szelet beolvad THEN a gate:stage → gate:push → vak ellenőr → gate:pr → CI → gate:merge bizonyítéka megvan.

## 11. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md`
