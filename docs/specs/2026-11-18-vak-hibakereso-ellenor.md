# Vak, hibakereső független ellenőr; a külső (Gemini) ellenőr kikerül a kapukból

- Dátum: 2026-11-18
- Végrehajtás: `docs/specs/2026-11-18-vak-hibakereso-ellenor-vegrehajtas.md`
- Ág: `chore/vak-hibakereso-ellenor` (a `chore/hook-onfailure-tilt` tetejéről, mert ugyanazt a `docs/minosegkapuk.md`-t érinti; a PR
  a #506 összevonása után, friss főág-beolvasztással nyílik)

## Tulajdonosi utasítás (2026-11-18, szó szerint)

> „A Gemini sort vedd ki az intézkedési sorból, vagy ahová beírtad, az egy egyszerű ellenőrzés volt. A lényeg az, hogy mindig egy vak
> alügynök ellenőrizze az elvégzett munkádat, hogy biztosan megtalálja a hibákat. Olyan típusú pontot is írj neki, amiben kifejezetten
> hibakeresésre utasítod. Lehet Anthropic modell, de akkor azt nagyon úgy utasítsd, hogy mindenképpen hibát keressen.”

## Háttér (ami most van)

- A minőségkapuk (`docs/minosegkapuk.md`, `AGENTS.md` „Minőségkapuk”) előírják, hogy minden fejlesztést egy friss kontextusú,
  csak olvasó alügynök ellenőrizzen a PR előtt; az ítéletet a `scripts/qa/gates/record-review.mjs` rögzíti
  (`<git-common-dir>/websuli-qa-evidence/review-<fej>.json`), a `pre-pr-gate` és a `pre-merge-gate` ezt olvassa.
- E mellett 2026-11-17 óta egy „külső (Gemini) ellenőr — második vélemény” lépés is van: a `scripts/qa/gates/external-review.mjs`
  a Google Gemini API-val ír jelentést, `--record`-dal `external-<fej>.json` bizonyítékot ír; a `pre-pr-gate` és a `pre-merge-gate`
  ezt olvassa, és a hiányát `WARN`-ként jelzi (soha nem bukás). Leírja: `docs/minosegkapuk.md` „Külső (Gemini) ellenőr” szakasz,
  `AGENTS.md` egy bekezdés, a `websuli-fejlesztesi-ellenor` skill 4/b szakasza.
- A független ellenőr megbízás-sablonja (skill 3. szakasz) ma kéri a hibakeresést, de átadja neki a fejlesztő helyi kapu-eredményét
  és „ismert kockázatait” — vagyis nem vak; a jelentésben nincs kötelező „mit próbáltam megtörni” / „mit nem vizsgáltam” szakasz, és a
  `record-review.mjs` csak az `Ítélet:` sort ellenőrzi.

## Cél

1. **A külső (Gemini) ellenőr kikerül a kapukból és az előírásokból.** A `pre-pr-gate` és a `pre-merge-gate` „külső (Gemini)
   ellenőr — második vélemény” lépése megszűnik (nem olvassák az `external-<fej>.json`-t, nem figyelmeztetnek a hiányára); a
   `lib.mjs` `externalResult` függvénye megszűnik; a runbook, az `AGENTS.md` és a kapu-skillek nem írják elő és nem ajánlják.
2. **A független ellenőr mindig VAK és HIBAKERESŐ.** A `websuli-fejlesztesi-ellenor` skill (forrás + tükör) és a runbook előírja:
   - **vak:** friss kontextusú alügynök, amely CSAK a követelményt (terv / tulajdonosi cél) és a diffet / fejet kapja; a fejlesztő
     jelentését, önértékelését, „zöld” állításait (kapu-eredmény, tesztszám) és az orkesztrátor várakozását NEM;
   - **(a)** kifejezett hibakereső keret: „a feladatod hibát találni, nem megerősíteni”; a „nem találtam hibát” csak a próbálkozások
     felsorolásával együtt fogadható el;
   - **(b)** feladat-specifikus hibakereső pontok (adatszerződés, biztonság / adatvédelem, regresszió, dátumhatár, migráció,
     versenyhelyzet, tesztminőség — a diffhez igazítva) + egy „bármi más, amit a fenti lista nem fed” pont;
   - **(c)** futtatás / ellenpróba saját ideiglenes munkafában vagy klónban (a fejlesztő munkafáját nem módosítja);
   - **(d)** a jelentés kötelező szakaszai: leletek evidenciával (fájl:sor + forgatókönyv), **„Mit próbáltam megtörni, és nem
     sikerült”**, **„Mit NEM vizsgáltam”**;
   - **(e)** visszanézésnél (javított fej) is hibakeresés a keret, nem csak a korábbi leletek pipálása;
   - **(f)** a mérce a tulajdonosi cél / terv (felületi változásnál a képernyőképek megnézése is).
   - Kész megbízás-sablon a skillben. Anthropic modell is lehet — a sablon kifejezetten hibakeresésre utasít.
3. **Gépi kikényszerítés:** a `record-review.mjs` csak olyan jelentést fogad el, amelyben megvan a `Fej:` sor (a rögzített fejre
   szól), az `Ítélet:` sor, és a két kötelező szakasz-fejléc („Mit próbáltam megtörni, és nem sikerült”, „Mit NEM vizsgáltam”).
   **Átmenet:** a már rögzített `review-<fej>.json` bizonyítékok érvényesek maradnak (a kapuk a bizonyítékot olvassák, nem a jelentést).
4. **`AGENTS.md` „Minőségkapuk”** 3. pontja (független ellenőr) a fentiek szerint; a Gemini-bekezdés törlése.

## Nem cél

- A `scripts/qa/gates/external-review.mjs` törlése. **Döntés: marad**, kézzel futtatható, nem kötelező eszközként (a kulcs továbbra
  is csak `GEMINI_API_KEY` / `--env-file`; a titok-szűrés, a `--record` és a tesztjei változatlanok). Indok: a tulajdonos „az egy
  egyszerű ellenőrzés volt” mondata az előírásból vételt kéri, nem az eszköz megsemmisítését; a törlés a kulcskezelés / titok-szűrés
  teszteit is vinné. A `--record` által írt `external-<fej>.json`-t ezután senki nem olvassa — a szkript fejkommentje ezt kimondja.
- A korábbi terv (`docs/specs/2026-11-17-kulso-ellenor.md`) átírása — történeti dokumentum; ez a terv felülírja a kapukra vonatkozó
  részét.
- Új kapu-lépés a jelentés tartalmára a `pre-pr-gate`-ben (a `record-review.mjs` a belépési pont; a kapuk a bizonyítékot olvassák).

## Érintett fájlok

| Fájl | Változás |
|---|---|
| `scripts/qa/gates/pre-pr-gate.mjs` | a „külső (Gemini)” lépés és az `externalResult` import törlése |
| `scripts/qa/gates/pre-merge-gate.mjs` | ugyanez; a `decideMerge` `external` paramétere és a `readEvidence('external-…')` törlése |
| `scripts/qa/gates/lib.mjs` | az `externalResult` függvény törlése |
| `scripts/qa/gates/external-review.mjs` | csak fejkomment: a kapuk nem olvassák a `--record` bizonyítékot |
| `scripts/qa/gates/record-review.mjs` | kötelező `Fej:` sor és két szakasz-fejléc |
| `scripts/qa/gates/*.test.mjs` | lásd „Teszt-változások” |
| `docs/minosegkapuk.md` | a „Külső (Gemini) ellenőr” szakasz törlése; a független ellenőr vak + hibakereső előírása |
| `AGENTS.md` | „Minőségkapuk” 3. pont; a Gemini-bekezdés törlése |
| `.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md` (+ `.claude/skills/…` tükör) | vak, hibakereső megbízás-sablon; a 4/b szakasz törlése |

## Teszt-változások (dokumentált spec-változás, nem gyengítés)

1. `scripts/qa/gates/pre-merge-gate.test.mjs`, „decideMerge: minden zöld …” teszt: a két állítás a „külső (Gemini)” lépés `WARN` /
   `PASS` állapotáról **megszűnik**, mert a lépés megszűnik (Cél 1). Helyette állítás: a `decideMerge` eredményében nincs „külső”
   nevű lépés.
2. `scripts/qa/gates/external-review.test.mjs`: az „externalResult: hiány / KIHAGYVA / kvóta → WARN …” teszt és „a kapu a hiányos /
   blokkolt bizonyítékot »HIÁNYZIK« figyelmeztetésként mutatja” teszt **megszűnik**, mert a mért függvény (`lib.mjs` `externalResult`)
   megszűnik (Cél 1). A `describe` címe „bizonyíték (--record)” lesz. A szkript többi tesztje (titok-szűrés, kulcskezelés, `--record`,
   válasz-értékelés) változatlan.
3. Új teszt (`scripts/qa/gates/vak-ellenor.test.mjs`): a `pre-pr-gate.mjs` és a `pre-merge-gate.mjs` forrása nem hivatkozik az
   `external-` bizonyítékra / `externalResult`-ra; a runbook, az `AGENTS.md` „Minőségkapuk” szakasza és a kapu-skillek nem írják elő
   a külső ellenőrt; a skill megbízás-sablonja tartalmazza a vak + hibakereső kötelező elemeit.
4. `scripts/qa/gates/record-review.test.mjs`: a minta-jelentések (mock) kiegészülnek a `Fej:` sorral és a két kötelező fejléccel
   (Cél 3 — új kötelező jelentés-elem); új esetek: hiányzó fejléc / hiányzó vagy eltérő `Fej:` → hiba; teljes jelentés → rögzít.

## Edge case-ek

- Visszaellenőrzésnél a jelentésben több `Fej:` / `Ítélet:` sor van: a UTOLSÓ számít (ugyanígy, mint ma az `Ítélet:`-nél).
- A `Fej:` sor rövid hash-t is tartalmazhat (≥ 7 jegy): a rögzített teljes fej előtagja legyen.
- A fejléc lehet `#`–`######` szintű; a kötelező szöveg pontosan egyezzen (a sablon adja).
- A már rögzített bizonyíték (régi formájú jelentéssel) a kapuknál érvényes marad — a `pre-pr-gate` / `pre-merge-gate` nem olvassa
  újra a jelentést.
- A `--record` nélkül vagy azzal futtatott `external-review.mjs` továbbra is működik; a kapuk kimenetében nincs róla sor.

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] V1 WHEN a `gate:pr` vagy a `gate:merge` fut THEN SHALL nem tartalmazni „külső (Gemini)” lépést, és nem olvasni az
  `external-<fej>.json`-t.
- [ ] V2 WHEN a runbookot, az `AGENTS.md` „Minőségkapuk” szakaszát vagy a kapu-skilleket olvassuk THEN a külső ellenőr SHALL nem
  szerepelni előírásként / ajánlásként.
- [ ] V3 WHEN a fejlesztő a független ellenőrt megbízza THEN a skill sablonja SHALL vak (csak követelmény + diff / fej) és hibakereső
  (a)–(f) keretet adni.
- [ ] V4 WHEN a `record-review.mjs` olyan jelentést kap, amelyből hiányzik a „Mit próbáltam megtörni, és nem sikerült” vagy a „Mit NEM
  vizsgáltam” fejléc, vagy a `Fej:` sor (illetve az nem a rögzített fejre szól) THEN SHALL hibával kilépni, bizonyíték nélkül.
- [ ] V5 WHEN a jelentés teljes THEN SHALL rögzíteni (a meglévő viselkedés szerint).
- [ ] V6 WHEN a mutációs ellenpróba a V4 bármely feltételét kiveszi THEN a teszt SHALL bukni.

## Kiegészítés — repó-szintű, környezet-semleges szabály (második tulajdonosi utasítás, 2026-11-18)

> „A vak ellenőr szabály legyen repó szintű, szabály kerüljön bele az AGENTS.md-be, készüljön belőle valóban használt skill, és
> bármilyen mesterséges intelligencia-ügynök környezetben futtatom a repó fejlesztését, javítását, az szerezzen róla tudomást és
> aszerint fusson.”

### Felmérés: a repó ügynök-vezérlő fájljai (`git ls-files`, 2026-11-18)

| Fájl | Ki olvassa | Érintem? |
|---|---|---|
| `AGENTS.md` | Codex, Claude Code (közös szabálykönyv), több más ügynök | IGEN — új önálló szakasz „Vak hibakereső ellenőr — kötelező” a kezelt `agentic-qa-kit` blokkon KÍVÜL; a „Minőségkapuk” 3. pontja erre hivatkozik |
| `.cursor/rules/minosegkapuk.mdc` (`alwaysApply: true`) | Cursor | IGEN — a 3. pont a vak ellenőrre hivatkozik |
| `.cursor/rules/vak-ellenor.mdc` | Cursor | ÚJ, `alwaysApply: true` (a `haromfazisu-munka.mdc` mintájára) |
| `.cursorrules` | Cursor (régi formátum) | IGEN — rövid, kötelező hivatkozás a fájl elején |
| `.github/copilot-instructions.md` | GitHub Copilot (review) | IGEN — egy pont: a PR-ban a vak ellenőr ítélet-sora a jelenlegi fejre szóljon; hivatkozás a szakaszra |
| `docs/agent-haromfazisu-munka.md` | minden ügynök (az AGENTS.md hivatkozza) | IGEN — a független ellenőrzés mondata a vak szabályra hivatkozik |
| `docs/minosegkapuk.md` | runbook | IGEN (a fő rész fent) |
| `docs/codex-felhokornyezet.md` | Codex felhőkörnyezet beállítása | IGEN — rövid pont: a felhőben futó Codex-feladat is a szakasz szerint jár el (ott nincs alügynök: új, tiszta feladat a tervvel és a diffel) |
| `.cursor/rules/haromfazisu-munka.mdc`, `.cursor/rules/websuli-core.mdc` | Cursor | NEM — a vak ellenőr a `minosegkapuk.mdc` + az új `vak-ellenor.mdc` dolga |
| A repó gyökerében álló `haromfazisu-munka.mdc`, `minosegkapuk.mdc`, `websuli-core.mdc` | senki (a Cursor a `.cursor/rules/` alól olvas; ezek eltérő, régi másolatok) | NEM — jegyre: archiválás (nem e PR hatóköre) |
| `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `Codex-iranyitasi-terv.md`, `Codex-vegrehajtasi-terv.md`, `.windsurfrules`, `.clinerules` | — | NEM LÉTEZIK a repóban — nem hozom létre |

### Döntések

- **Az AGENTS.md szakasza a szabály forrása**, környezet-semleges megfogalmazással: az ellenőr friss kontextusú, a fejlesztő
  következtetéseit nem ismerő ügynök — ahol a környezet tud alügynököt indítani, alügynök; ahol nem (egyes Codex / Cursor / Gemini
  futások), új, tiszta munkamenet vagy másik eszköz, amely CSAK a tervet és a diffet kapja. A fejlesztő saját magát soha nem
  ellenőrizheti. Kötelező: hibakereső keret, feladat-specifikus hibakereső pontok + „bármi más”, futtatás / ellenpróba saját ideiglenes
  munkafában, a két kötelező jelentés-szakasz, visszanézésnél is hibakeresés.
- **A skill** (`websuli-fejlesztesi-ellenor`) leírása úgy szól, hogy minden elkészült fejlesztésnél betöltődjön; benne a kész
  megbízás-sablon és egy „hogyan indítsd, ha nincs alügynök-eszköz” rész.
- **Gépi kikényszerítés — felmérés:** ma a rögzített ítéletet (a) a Claude Code `check-quality-gates` hookja kéri a PR-nyitás és a
  merge előtt (csak Claude Code), (b) a `gate:pr` / `gate:merge` szkript kéri — ez minden környezetben fut, de csak ha az ügynök
  lefuttatja; (c) a CI-ban SEMMI nem ellenőrzi. Más környezetben (Codex felhő, Cursor) tehát ma csak az előírás köt.
- **Ezért új szkript** (`scripts/qa/gates/pr-verdict-check.mjs`, ebben a PR-ban, teszttel): a GitHub-esemény fájljából
  (`GITHUB_EVENT_PATH`) kiolvassa a PR leírását és a fej SHA-ját, és csak akkor ad 0-s kilépést, ha a leírásban van
  `Független ellenőr ítélete: IGEN | IGEN, FELTÉTELLEL (fej: <hash>)` sor, amelynek hash-e a jelenlegi fej előtagja (a meglévő
  `lib.mjs` `resolveVerdict` / `verdictResult` logikájával). `NEM` vagy hiányzó / más fejre szóló sor → 1-es kilépés, érthető
  üzenettel.
- **A CI-lépés KÜLÖN szelet** (nem ebben a PR-ban; a `.github/workflows/` C-61 szerint „bármely main-változás” hatókörű, és a CI
  szeletelésén a `chore/ci-e2e-szeleteles` ág dolgozik). Pontos leírás a következő szelethez:
  - új job a `ci.yml`-ben (vagy a szeletelés utáni megfelelő workflow-ban): `independent-review`, `on: pull_request` (`opened`,
    `edited`, `synchronize`, `reopened`), egyetlen lépés: `node scripts/qa/gates/pr-verdict-check.mjs --event "$GITHUB_EVENT_PATH"`;
    `actions/checkout` + Node, függőség nélkül (a szkript csak a `lib.mjs`-t használja);
  - a főág-védelem kötelező ellenőrzései közé felvenni (tulajdonosi beállítás a GitHubon);
  - ismert korlát: a leírás-frissítés (`edited`) új futást indít; a pusht követő első futás a régi ítélet-sor miatt piros, amíg a
    leírás nem frissül — ez szándékos (a fej változott, új ítélet kell).

### Előkészítés a gépi vak ellenőr-futtatóhoz (orkesztrátori kérés, 2026-11-18)

A vak ellenőrt később egy konfigurált független modellt indító futtató végzi (másik, külön PR-ban érkező ág). Ehhez:
- a „Ki az ellenőr” rész EGY helyen, jól elkülönítve áll (az AGENTS.md szakaszában, a skillben és a runbookban egy-egy „Ki az
  ellenőr” alszakasz), egyelőre környezet-semlegesen;
- a megbízás szövege EGYETLEN, gépileg olvasható fájlban van: `scripts/qa/gates/vak-ellenor-megbizas.md` (a futtató ebből veszi az
  üzenetet; a skill, az AGENTS.md és a runbook csak hivatkozik rá, nem másolja);
- a `record-review.mjs` jelentés-ellenőrzése egy kicsi, önálló függvényben van (`checkReport(text, full)`), amelyet a másik ág
  bővíthet a `buildRecord` érintése nélkül.

### Elfogadás (EARS) — kiegészítés

- [ ] V7 WHEN az `AGENTS.md`-t olvassuk THEN SHALL tartalmazni a „Vak hibakereső ellenőr — kötelező” szakaszt a kezelt blokkon kívül,
  a tulajdonosi idézettel, dátummal és a kötelező kulcsmondatokkal; a „Minőségkapuk” 3. pontja erre hivatkozik.
- [ ] V8 WHEN bármely fent „IGEN”-nel jelölt vezérlőfájlt olvassuk THEN SHALL hivatkozni az AGENTS.md szakaszára (őr-teszt; ha valaki
  kitörli, a teszt bukik).
- [ ] V9 WHEN a `websuli-fejlesztesi-ellenor` skillt olvassuk THEN a leírása SHALL minden elkészült fejlesztésnél betöltést előírni, és
  tartalmaznia a kész megbízás-sablont és az alügynök-eszköz nélküli indítás leírását.
- [ ] V10 WHEN a `pr-verdict-check.mjs` olyan eseményt kap, amelyben a PR-leírás ítélet-sora hiányzik, más fejre szól vagy NEM THEN
  SHALL 1-gyel kilépni; IGEN / IGEN, FELTÉTELLEL a jelenlegi fejre → 0.
- [ ] V11 WHEN a mutációs ellenpróba a V7–V10 bármely védő feltételét kiveszi THEN a teszt SHALL bukni.
