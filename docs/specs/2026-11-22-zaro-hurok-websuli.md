# Spec: Záró hurok — a WEBSULI saját, repón belüli változata

> Dátum: 2026-11-22 · Szerző: Claude (fejlesztő alügynök) · Állapot: JÓVÁHAGYVA (tulajdonosi kérés 2026-11-22: „minden elvégzett feladat
> után … trap, QMD, YAML, Cogni, vektoros és kanban memóriák … higiénia … tiszta fával várni a következő feladatot”, és „a több gépen
> futó záró folyamatokból meríts ötleteket, és alakítsd ki a saját WEBSULI-változatot”)
> Végrehajtás: `docs/specs/2026-11-22-zaro-hurok-websuli-vegrehajtas.md`

## 1. Cél

Minden lezárt WEBSULI-feladat után ugyanaz a hét lépéses záró hurok fusson (csapda → memória-rétegek → vektor → kanban → skill →
higiénia → tiszta fa), és a teljesülését **repón belüli, gépi kapu** döntse el (`npm run zaro:check -- --since <ISO>`, exit 0 / 1),
ne az ügynök állítása. A másik gépről a főágra került váz (`edee295f`, `0645f48f`) rétegei igazolt tényekkel kitöltve, a WEBSULI
meglévő szabályaihoz (egyetlen csapdakatalógus, a Claude Code tapasztalat-kanbanja, skill-tükör, minőségkapuk) igazítva élnek tovább.

## 2. NEM cél (out of scope)

- A `.hermes.md` `agentic-qa-kit:zaro-hurok` markeres blokkja érintetlen (a másik gép eszközéé; a blokk maga tiltja a kézi szerkesztést).
- Más repó (köztük a `D:\repo\agentic-qa-kit`) kódjának olvasása, másolása, importja. A kapu a WEBSULI-ban nulláról készül.
- Második csapdatábla (`.hermes/projekt/TRAP.md`) létrehozása.
- Vektoros index építése (helyi beágyazó nélkül nincs mit építeni; a kapu csak az elérhetőséget jelenti).
- Távoli ág törlése, nem beolvasztott ág / munkafa eltávolítása, `git worktree remove --force`.
- Az alkalmazás (`source/client|server|shared`) kódja nem változik.
- Push, PR, merge (a fejlesztő megbízása ezt tiltja; az orkesztrátor végzi).

## 3. Érintett területek

| Fájl | Változás |
|---|---|
| `scripts/qa/zaro-hurok.mjs` | ÚJ — `check`, `hygiene`, `nincs-uj`, `konvergencia` alparancs |
| `scripts/qa/zaro-hurok.test.mjs` | ÚJ — ideiglenes git-táras tesztek |
| `package.json` | `"zaro:check": "node scripts/qa/zaro-hurok.mjs check"` |
| `.github/workflows/ci.yml` | a `scripts/qa` tesztlépés (29. sor) listájába a `zaro-hurok.test.mjs` |
| `scripts/qa/gates/gates.config.json` | `mirroredSkills` + `websuli-zaro-hurok` |
| `scripts/qa/gates/skills-sync-check.test.mjs` | a valódi tükör-teszt darabszáma 5 → 6 (dokumentált spec-változás: új tükrözött skill) |
| `.agents/skills/websuli-zaro-hurok/SKILL.md` + `.claude/skills/websuli-zaro-hurok/SKILL.md` | ÚJ skill + bájtazonos tükör — tervezett, a feat/zaro-hurok-3 PR-ral érkezik |
| `source/tests/memory-layer-refs-guard.test.ts` | memória-réteg hivatkozás-őr (a feat/zaro-hurok-2-ben): nem létező aktív hivatkozás, fájl:sor nélküli döntés, séma-elcsúszás |
| `AGENTS.md` | új „Záró hurok (kötelező)” szakasz a kezelt `agentic-qa-kit` blokkon kívül |
| `docs/agent-csapdak.md` | az ideiglenes sorszám szabálya + egy `C-ZH-1` bejegyzés |
| `memory/manifest.yaml`, `memory/index.qmd`, `memory/.cogni/*.cogni.yaml` | a TODO-k kitöltése igazolt tényekkel, a térkép a valódi WEBSULI-utakra |

## 4. Rögzített döntések és kényszerek

- **D1 — egyetlen csapdafájl:** a `docs/agent-csapdak.md` marad az egyetlen csapdakatalógus; a manifest `trap_table` erre mutat.
- **D2 — ideiglenes csapdaszám:** ágon a bejegyzés sorszáma `C-<ág-rövidítés>-N` (pl. `C-ZH-1`; az ág-rövidítés 1–8 nagybetű /
  számjegy, betűvel kezdődik). A végleges `C-NN` a merge ELŐTT kerül rá (az orkesztrátor osztja ki a főág aktuális legnagyobb száma
  után). A záró kapu a **főágon** (`main`) FAIL-lel jelzi a még ideiglenes számot; más ágon csak felsorolja (INFO).
- **D3 — memória-rétegek:** YAML = `memory/manifest.yaml`; QMD = `memory/index.qmd`; Cogni = `memory/.cogni/{project,modules,decisions,schema}.cogni.yaml`;
  jegyzetek = `memory/notes/` (a `memory/indexes/index.yml` `notes` gyűjteménye őrzi, `source/tests/memory-index-guard.test.ts`).
  A váz `.agent/memory/yaml/index.yaml` és `.hermes/skills/` hivatkozása a WEBSULI-ban nem létezik → a manifestből kikerül; a skillek
  helye `.agents/skills/` (forrás) ↔ `.claude/skills/` (tükör).
- **D4 — „nincs új” jelölő:** YAML-ban `# zaro-hurok: <ISO> nincs-uj`, Markdown/QMD-ben `<!-- zaro-hurok: <ISO> nincs-uj -->`.
  A jelölő után opcionális fajta-lista állhat (`nincs-uj kanban`); a kanban rétegnél CSAK a `kanban` fajtájú jelölő számít (a
  manifest sima jelölője a YAML-réteget jelöli, nem a kanbant). Egy fájlban fajtánként egy jelölő él: a `nincs-uj` alparancs a
  régit cseréli, nem halmoz.
- **D5 — „a since óta változott”:** a fájl tartalma eltér a since előtti utolsó commitban lévőtől (`git rev-list -1 --before=<since> HEAD`;
  ha nincs ilyen commit, az üres fa), a munkafa állapotát is beleértve; a csapdánál és a retrónál hozzáadott sor kell (bővülés).
- **D6 — YAML-ellenőrzés függőség nélkül:** a repó gyökerének nincs `node_modules`-a, és a `source/` sem tartalmaz YAML-elemzőt. A kapu a
  memória-fájlok szűk YAML-részhalmazát szerkezetileg ellenőrzi (tabulátor a behúzásban, behúzás-lépcső, kulcs-szintaxis, duplikált
  kulcs egy szinten, kiegyensúlyozott idézőjel és `[]`/`{}`, blokk-skalár `|`/`>`). Precedens: `memory-index-guard.test.ts` („nincs
  YAML-függőség, a szűk alakot magunk olvassuk”).
- **D7 — TODO tilalom:** a YAML-fájlok megjegyzésen kívüli részében és a QMD-ben a `TODO` szó FAIL.
- **D8 — retró:** teljesül, ha a since óta bővült egy `docs/handoffs/*-retro.md`, vagy egy `docs/specs/*.md` olyan sorral bővült, amely a
  fájl „Állapotnapló” fejezetcíme UTÁN áll.
- **D9 — kanban (javítva 2026-11-22, orkesztrátori kérés; a tulajdonos kétszer rögzítette: a tapasztalat-kanban a Claude Code saját
  környezetében van, NEM a Hermesben):** alapból a `~/.claude/projects/<repó-név, pl. D--repo-WEBSULI>/kanban/tapasztalat-kanban.md` fájl (a
  projektnév a fő munkakönyvtár útvonalából képzett: minden nem betű/számjegy karakter `-`; a `~/.claude`-ot a `CLAUDE_CONFIG_DIR`
  felülírja). Teljesül, ha a módosítási ideje ≥ since, vagy a `memory/manifest.yaml`-ban friss `nincs-uj kanban` jelölő áll. A
  `--kanban-file <út>` (ismételhető) az alapfájlt felülírja. A `.hermes/kanban.db` és a `HERMES_KANBAN_CLI` nem feltétel.
- **D10 — skill:** (a) a `.agents/skills` ↔ `.claude/skills` tükör ép — a meglévő `scripts/qa/gates/skills-sync-check.mjs`
  `checkSkills` függvényét hívja (nem másolja), a cél-repó `scripts/qa/gates/gates.config.json` `mirroredSkills` listájával;
  (b) minden since óta hozzáadott `## C-…` csapda-bejegyzés szakasza skillre hivatkozik (`.agents/skills/<név>` vagy
  `.claude/skills/<név>`) vagy `nincs-skill: <indok>` sort tartalmaz.
- **D11 — higiénia CSAK riport alapból:** a `hygiene` alparancs `--apply` nélkül semmit nem módosít. `--apply` kizárólag (1) a lezárt
  munkafát távolítja el (`git worktree remove` `--force` nélkül): nem a fő munkakönyvtár, nem az aktuális, ágon áll (nem detached),
  az ága a főágba (`origin/main`, ha van; különben `main`) beolvasztott (ős), és a fa tiszta; (2) a `git worktree prune`-nal az árva
  (eltűnt mappájú) bejegyzést; (3) a beolvasztott, munkafa nélküli helyi ágat `git branch -d`-vel (soha `-D`). Nem beolvasztott ág,
  piszkos vagy detached munkafa, a `main`/`master`/alapág és az aktuális ág érintetlen; távoli ághoz soha nem nyúl. A `check` 6.
  lépése a riportot adja, és nem buktat.
- **D12 — vektoros réteg:** a WEBSULI-környezetben nincs vektoros memória (globális memória, 2026-11-22: „ne állítsd vezetettnek”). A
  kapu a helyi beágyazót (Ollama, `http://127.0.0.1:11434/api/tags`, ≤ 800 ms) próbálja; ha nem válaszol, „nem elérhető” (N/A) állapot,
  NEM buktat; ha válaszol, „elérhető, index-építés nincs a WEBSULI hatókörében” (INFO). Fizetős szolgáltatást a kapu nem hív.
- **D14 — vak körök konvergenciája (orkesztrátori kiegészítés 2026-11-22, tulajdonosi „törvény”: ugyanazt a hibát tilos ugyanúgy
  újra elkövetni):** a `konvergencia` alparancs a közös `.git` `websuli-qa-evidence/blind-review-<fej>.json` bizonyítékaiból (a
  `WEBSULI_QA_EVIDENCE_DIR` felülírhatja, `scripts/qa/gates/lib.mjs` `evidenceDir`), egy ág saját commitjainak sorrendjében (vagy
  `--heads` / `--reports` szerint) kiszámolja a blokkolók számát és a NEM-sorozatot. Új vak kör csak akkor indulhat, ha az utolsó
  két kör között a blokkolók száma szigorúan csökkent és legfeljebb 2 egymást követő NEM áll; különben exit 1 (megközelítésváltás:
  követelmény / invariáns egy mondatban → hibaosztály-leltár → PR-bontás ≤ ~400 sor → szakmai forrás → tulajdonosi döntés; C-ZH-2).
  A befejezetlen futás (`complete: false` vagy `incomplete` a fájlnévben) nem kör. Minta: a globális `vak-kor-konvergencia.py` logikája,
  a repóba saját, tesztelt kód kerül.
- **D13 — kimenet:** emberi szöveg alapból, `--json`-nal egy JSON-objektum (`{ ok, since, branch, steps: [{ id, name, status, note,
  details }] }`); állapotok: `PASS`, `FAIL`, `INFO`, `N/A`. Exit 0, ha nincs FAIL, különben 1; hibás argumentum: exit 2.

## 5. Edge case-ek

- Hiányzó vagy érvénytelen `--since` → exit 2, magyar hibaüzenet.
- Nincs since előtti commit (új repó) → az üres fához mér (minden tartalom „új”).
- Új, még nem követett réteg-fájl → változottnak számít; a 7. lépés (tiszta fa) viszont jelzi.
- Hiányzó réteg-fájl → FAIL az adott rétegen.
- Régi (since előtti) jelölő → nem számít.
- Ideiglenes csapdaszám más ágon → INFO, a főágon FAIL.
- Hamis találat elkerülése: az ideiglenes szám mintája `C-[A-Z][A-Z0-9]{0,7}-\d+` szóhatárral (a „BY-NC-SA 4.0” nem illik rá).
- Windows, `core.autocrlf=true`: minden szövegolvasás `\r\n` → `\n` normalizált.
- Hiányzó tapasztalat-kanban (CI, friss gép) → csak `--kanban-file` vagy a `nincs-uj kanban` jelölő teljesítheti; a Hermes-tábla friss
  módosítási ideje nem számít.
- Munkafából futtatva a fő munkakönyvtár (`git-common-dir` szülője) soha nem kerül eltávolításra.

<!-- acceptance-checklist -->
## 6. Elfogadási kritériumok (EARS)

- [ ] E1 WHEN `zaro:check --since <ISO>` fut és a `docs/agent-csapdak.md` a since óta nem bővült ÉS nincs friss nincs-uj jelölője THEN the system SHALL a csapda lépést FAIL-re tenni és exit 1-gyel kilépni.
- [ ] E2 WHEN a csapdafájl a since óta bővült VAGY friss `<!-- zaro-hurok: <ISO> nincs-uj -->` jelölőt kapott THEN the system SHALL a csapda lépést PASS-ra tenni.
- [ ] E3 WHEN az aktuális ág `main` és a csapdafájlban `C-<rövidítés>-N` alakú sorszám áll THEN the system SHALL FAIL-t adni a sorszámok felsorolásával; más ágon INFO-t.
- [ ] E4 WHEN a YAML / QMD / Cogni réteg bármely fájlja a since óta nem változott és nincs friss jelölője THEN the system SHALL FAIL-t adni a fájl megnevezésével.
- [ ] E5 WHEN egy réteg YAML-fájlja szerkezetileg érvénytelen THEN the system SHALL FAIL-t adni fájl:sor hivatkozással.
- [ ] E6 WHEN egy YAML-fájl megjegyzésen kívüli részében vagy a QMD-ben `TODO` áll THEN the system SHALL FAIL-t adni.
- [ ] E7 WHEN sem `docs/handoffs/*-retro.md`, sem `docs/specs/*.md` állapotnaplója nem bővült a since óta THEN the system SHALL a retró lépést FAIL-re tenni.
- [ ] E8 WHEN a tapasztalat-kanban (alapból a Claude Code projektmappájában, vagy a `--kanban-file` fájlok) mtime-ja since előtti és nincs friss `nincs-uj kanban` jelölő a manifestben THEN the system SHALL a kanban lépést FAIL-re tenni.
- [ ] E9 WHEN a skill-tükör eltér, vagy egy since óta hozzáadott `## C-…` bejegyzés nem hivatkozik skillre és nincs `nincs-skill:` sora THEN the system SHALL a skill lépést FAIL-re tenni.
- [ ] E10 WHEN `hygiene` `--apply` nélkül fut THEN the system SHALL semmilyen ágat / munkafát nem módosítani, csak riportot adni.
- [ ] E11 WHEN `hygiene --apply` fut THEN the system SHALL kizárólag a beolvasztott + munkafa nélküli helyi ágakat és a lezárt (beolvasztott, tiszta, nem aktuális, nem fő) munkafákat eltávolítani; a nem beolvasztott ágat és a piszkos munkafát érintetlenül hagyni; távoli ághoz nem nyúlni.
- [ ] E12 WHEN a munkafa nem tiszta THEN the system SHALL a 7. lépést FAIL-re tenni.
- [ ] E13 WHEN a helyi beágyazó nem érhető el THEN the system SHALL a vektoros lépést `N/A`-ra tenni, és ettől nem buktatni.
- [ ] E14 WHEN `--json` kapcsolóval fut THEN the system SHALL egyetlen érvényes JSON-objektumot írni a standard kimenetre, és exit 0-t adni, ha nincs FAIL, különben 1-et.
- [ ] E15 WHEN `nincs-uj --kind <lista>` fut THEN the system SHALL a megadott rétegek fájljaiba fajtánként egyetlen friss jelölőt írni (a régit cserélve).
- [ ] E16 WHEN a memória-rétegeket olvassák THEN the system SHALL bennük TODO-t, titkot és valódi e-mail-címet nem tartalmazni, a tények forrása (fájl) megjelölve (`no-real-emails-guard`, `memory-index-guard` zöld).
- [ ] E18 WHEN `konvergencia` fut és az utolsó két kör blokkolószáma nem csökkent szigorúan, vagy 3+ egymást követő NEM áll THEN the system SHALL exit 1-gyel megtiltani az új vak kört, és a megközelítésváltás lépéseit kiírni; egyébként exit 0; hibás hívás exit 2.
- [ ] E19 WHEN a `websuli-zaro-hurok` skill zárólépései futnak THEN the system SHALL egy „Ismétlődő hibaosztály” lépést tartalmazni: rögzített hibaosztály újbóli előfordulásánál gépi kényszerítés (szkript / teszt / hook) kell, nem csak szöveg.
- [ ] E17 WHEN a `websuli-zaro-hurok` skill elkészül THEN the system SHALL a forrást és a tükröt bájtazonosan tartani (`skills-sync-check.mjs` zöld), az AGENTS.md pedig a kezelt blokkon kívül hivatkozzon rá és a kapura.

## 7. Tesztterv

- `scripts/qa/zaro-hurok.test.mjs` (ideiglenes git-tár, `GIT_COMMITTER_DATE`/`GIT_AUTHOR_DATE` a since előtti / utáni commitokhoz):
  E1–E2 (bővülés vs. jelölő vs. régi jelölő), E3 (main vs. ág), E4–E6 (változatlan réteg, érvénytelen YAML, maradék TODO), E7, E8
  (mtime `utimesSync`-kel), E9 (tükör + skill-hivatkozás), E10–E11 (riport vs. `--apply`; a nem beolvasztott ág és a piszkos munkafa
  megmarad), E12, E13 (injektált próba), E14 (CLI-futtatás `--json`), E15; a YAML-ellenőrző egységtesztjei; E18 (`decideConvergence`,
  `roundFromReport`, `collectRounds` ideiglenes bizonyíték-mappával, CLI exit 0 / 1 / 2).
- A valódi repón: `node --test scripts/qa/zaro-hurok.test.mjs scripts/qa/gates/*.test.mjs`; `source/`-ban
  `npx.cmd tsx --test tests/memory-index-guard.test.ts tests/no-real-emails-guard.test.ts`; `npm run gate:stage`; próbafutás
  `npm run zaro:check -- --since 2026-11-22T00:00:00+01:00 --json`.

## 8. Kockázatok / visszavonási terv

- A `hygiene --apply` ágat / munkafát töröl → csak `git branch -d` és `--force` nélküli `git worktree remove`; a git maga is megtagadja a
  nem beolvasztott / piszkos esetet. Teszt bizonyítja, hogy a nem beolvasztott ág megmarad.
- A szűk YAML-ellenőrző téves FAIL-t adhat egy szokatlan, de érvényes YAML-ra → a memória-fájlok formája egyszerű marad; a teszt a
  valódi réteg-fájlokat is ellenőrzi.
- Squash-merge után az ág nem „ős” → a hygiene csak riportolja (konzervatív, nem töröl).
- Visszavonás: a PR revertje; a kapu nem része a `gate:*` láncnak, így más folyamatot nem állít meg.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-22-zaro-hurok-websuli-vegrehajtas.md`

## 10. Állapotnapló

- 2026-11-22: terv és végrehajtási utasítás kész (`feat/zaro-hurok-websuli`, a `fix/memoria-index-jegyzetek` ágra építve).
- 2026-11-22: orkesztrátori kiegészítés — `konvergencia` alparancs (D14, E18), „Ismétlődő hibaosztály” skill-lépés (E19), C-ZH-2 csapda.
- 2026-11-22: megvalósítva (`effc1b6c`, `776dc8f2`, `7a2bafdc`, rétegek `67e4afb1`). Ellenőrzés: `node --test scripts/qa/zaro-hurok.test.mjs
  scripts/qa/gates/*.test.mjs` 138/138; `memory-index-guard` + `no-real-emails-guard` 7/7; `npm run gate:stage` ZÖLD. Próbafutás:
  `zaro:check` a kanban lépésen PIROS (a `.hermes/kanban.db` 2026-11-20-i, a kanban CLI ezen a gépen nincs beállítva —
  `HERMES_KANBAN_CLI` üres), `--kanban-file`-lal a tapasztalat-kanbanra ZÖLD. Ezen a gépen fut helyi Ollama → a vektor-lépés INFO.
  `konvergencia` a valódi bizonyítékokon: `chore/vak-ellenor-deepseek` (4 NEM, 1 → 1) és `fix/kitakaro-negyzetes-regex` (7 NEM) → TILOS;
  `perf/kockavadasz-telefon-gyors` → INDULHAT. Ismert korlát: squash-merge után az ág nem „ős”, ezért a higiénia csak riportolja.
- 2026-11-22: vak kör a feat/zaro-hurok-2-n (`d87f4c1e`): NEM, 2 blokkoló + 4 közepes + 1 kicsi (L1–L7). Osztályszintű javítás: (A) nem
  létező hivatkozás → a még nem szállított elem csak „tervezett” jelöléssel; (B) forrás nélküli döntés → a döntés-naplóban csak követett
  fájl:sor forrás, a költési felhatalmazások kikerültek; (C) pontatlan tényleírás (útvonal-sablon, séma-célok, kapusorrend, tükör
  hatóköre). Gépi kényszerítés: `source/tests/memory-layer-refs-guard.test.ts`. Ugyanez az átnézés a -1 és a -3 ágon.
- 2026-11-22: orkesztrátori javítás — a kanban-lépés alapja a Claude Code tapasztalat-kanbanja (D9, E8), a Hermes-tábla nem feltétel;
  bontás három, sorban beolvasztható PR-ra: `feat/zaro-hurok-2` (rétegek) → `feat/zaro-hurok-1` (kapu + teszt + bekötés + terv) →
  `feat/zaro-hurok-3` (skill + tükör + a `gates.config.json` `mirroredSkills` bővítése + a `skills-sync-check.test.mjs` darabszáma + AGENTS.md +
  csapdák). Ok: a kapu tesztje a kitöltött rétegeket is ellenőrzi, a skill-tükör a
  `mirroredSkills` bővítését, a csapdák és az AGENTS.md a kapu parancsait — ezért ez a sorrend önállóan zöld.
- 2026-11-22: 2. vak kör a feat/zaro-hurok-2-n (`a2b70fb2`): NEM, 1 blokkoló + 7 közepes. Megközelítésváltás: a memória-rétegekben csak
  gépileg igazolt tény marad (követett út, létező parancs, szó szerinti idézet fájl:sorral); a séma-snapshotból mind az 59
  szabadszöveges célleírás kikerült. Az őr Git-követett hivatkozást, bejegyzésenkénti forrást és szó szerinti idézetet kényszerít.
