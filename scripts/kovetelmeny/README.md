# Követelmény-adatbázis (WEBSULI)

Egy helyen, visszakereshetően: mit kért a tulajdonos (mikor, hol, milyen döntéssel), és mi a teljesülés nyoma (commit, PR, spec,
kapcsolóállapot). A záró revízió (`.agents/skills/websuli-kovetelmeny-revizio/SKILL.md`, tükör: `.claude/skills`, `.hermes/skills`) ezzel veti össze az elvárt és a valós működést.

- **Adatbázis:** `%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db` (felülírható: `--db` / `KOVETELMENY_DB`).
  A repón KÍVÜL van, mert a kérésekben valódi nevek lehetnek. E-mail-cím (Unicode helyi résszel is), titok, Bearer/Basic token, JWT,
  adatbázis-URL a DB-be is csak maszkolva kerül (`a***@pelda.hu`, `[TITOK]`) — `maszk.py`: minden forrásszöveg, az `extra` metaadat
  (rekurzívan), a kézi `allit`/`lelet-add` bevitel. A naplóba profilnév nem kerül (`~`, `%LOCALAPPDATA%`, Hermes-profil sorszámmal).
  Jogosultság: POSIX-on könyvtár 0700, fájl 0600; Windowson a `%LOCALAPPDATA%` ACL-je eleve felhasználónkénti (az `os.chmod` ott csak
  az írásvédettséget kezeli), ezért ott nincs külön szigorítás.
- **Gyűjtő:** `python scripts/kovetelmeny/gyujt.py [--fetch] [--napok 180] [--no-gh] [--no-render] [-q]` — idempotens (≈30 s;
  két egymás utáni futás után a sorszámok ÉS a követelmény-/kapcsolat-tartalom hash-e azonos).
- **Nem elérhető forrás** (`--no-gh`, `--no-render`, hálózati/git-hiba, zárolt kanban-DB): semmit nem töröl, nem fokoz le. A kapcsolatok a
  DB-ben tárolt forrásokból épülnek újra, családonként (`requirement_links.origin`), és csak a sikeresen újraszámolt család cserélődik.
  A Render-mérés hiányában a korábbi élő érték marad (`flags.live_checked_at`); új kapcsoló ilyenkor `nem ellenőrzött`, ami SOHA nem KI.
- **Megőrzés:** az ablakon (`--napok`) kívüli munkamenet-üzenet törlődik; a forrásból eltűnt üzenet csak sikeres eszközolvasás után.
- **Lekérdező / revízió:** `python scripts/kovetelmeny/revizio.py <parancs>` (`allapot`, `lista`, `tetel`, `kereses`, `felulirasok`,
  `ellenoriz`, `lelet-add`, `lelet-lista`, `allit`; `--help`).
- **Kurált elvárások:** `kovetelmenyek.json` — a munkamenetek tulajdonosi kéréseiből értelmezve, összevonva (egy tétel = egy tesztelhető
  elvárás). Nyilvános repó: név, e-mail-cím, titok TILOS benne.

## Források (`sources.kind`)

| kind | honnan | ref |
|---|---|---|
| commit | `git log --all --since` (180 nap), `extra.main` = a main-en van-e, `extra.allapot` = utolsó `Állapot:` sor | teljes hash |
| pr | `gh pr list --state all` (lezárt/beolvadt: 180 nap; nyitott: korától függetlenül) + nyitott PR-ok feloldatlan review-szálai (GraphQL, lapozva; a sikeres lekérésben már nem szereplő szál `extra.unresolved=false`, nem kötődik) | `#N`, `#N:szal:<id>` |
| spec | `git ls-tree -r origin/main -- docs/specs` minden `.md`-je (`extra.allapot`, `extra.dontes`) | útvonal |
| doc | AGENTS.md, TUDAS, SZALAK, RETRO, lesson-improvement, agent-csapdak, websuli-potlasok — `##` szakaszonként | `fájl#n` |
| trap | `.hermes/projekt/TRAP.md` soronként | `TRAP:<sha1>` |
| session | csak felhasználói üzenet: Claude Code (`~/.claude/projects/*WEBSULI*`, régi gép mentése), Hermes `state.db` (fő + profilok, csak olvasva, alügynök-ülések nélkül), Codex (üzenetenként: WEBSULI-munkakönyvtár vagy az üzenet említi) — egyediség az üzenet-azonosító szerint | `cc:/hm:/cx:<ülés>:<üzenet>` |
| kanban | Hermes `websuli` és (WEBSULI-t említő) `hermes-agent` tábla, régi `.hermes/kanban.db` (mentésből) | `tábla:t_…` |
| task | SQL feladat-nyilvántartás (`docker exec hermes-mem0-pg psql`, `feladat.tasks`, repo=websuli) | `feladat:<id>` |
| config | kapcsolók: kód-alapérték + Render env (lapozva; logikai/numerikus érték, egyébként „beállítva (érték rejtve)” / „hiányzik”) | `flag:<NÉV>` |

## Séma (az ajánlotthoz képest bővítve)

- `sources(id, kind, ref, date, title, raw_excerpt, extra JSON)` — egyedi `(kind, ref)`.
- `requirements(id, code UNIQUE, title, statement, category, origin_source_id, date, status, superseded_by, evidence, verify_hint,
  last_checked, notes, auto_status, status_source, parent, rule, manual_evidence)`.
  - `manual_evidence`: a `revizio.py allit` kézi bizonyítéka (maszkolva) — a gyűjtő SOSEM írja felül; az `evidence` az automatikus rész.
  - `status`: `elvart|kesz|reszben|felkesz|elfelejtett|kapcsolo_ki|felulirt|elvetve|ismeretlen`.
  - `status_source='auto'`: a gyűjtő minden futáskor újraszámolja; `revizio.py allit` után `'revizio'` → a gyűjtő nem írja felül (csak `auto_status`-t).
  - `superseded_by` = az ÚJABB követelmény `code`-ja (az újabb utasítás felülírja a régit; mindig a lánc vége számít).
  - `rule` (JSON): a kurált ellenőrzési szabály (`flag`, `grep`, `old_grep`, `prs`, `kanban`) vagy a generálás módja (`spec`, `p-tetel`, `open-pr`, `task`…).
- `requirement_links(requirement_id, source_id, relation, origin)` — `kert|dontes|megvalositja|reszben|felulirja|teszt|kapcsolo`;
  `origin` = család (`spec`, `p`, `kuralt`, `kod`, `openpr`, `task`).
- `flags(name, code_default, live_value, owner_decision, checked_at, code_ref, notes, state, live_checked_at, stale)` — `state`:
  `be|ki|reszleges|nem_ellenorzott|nem_logikai` a kapcsoló SAJÁT kódbeli szabálya szerint (pl. `PLAYER_ACCOUNTS`/`ADVENT_CALENDAR`: on/1/true;
  `MP_MODE`: on, `admin` = részleges; vészfékek: csak `0` a KI); `stale=1`: teljes, sikeres mérésben már nem szerepelt.
- `revisions(id, started_at, finished_at, summary)`, `findings(..., kind, severity, proposed_slice, status nyitott|megszunt|javitva, first_seen, last_seen, kulcs)`
  — `kulcs` = dedupe-kulcs (`auto:<req>:<kind>` vagy `kezi:…`); a sikeresen mért, de meg nem ismétlődő automatikus lelet `megszunt`,
  a nem mért (git-hiba, nem ellenőrzött kapcsoló) megmarad.
- `meta('utolso_gyujtes')` — utolsó futás ideje, sorszámok, a sikeres források és a nem elérhető források listája.
- FTS5: `requirements_fts`, `sources_fts` (futásonként újraépítve).

## Követelmények keletkezése

1. **SPEC:<terv>** — minden nem `-vegrehajtas` terv; státusz az `Állapot:` sorból, ennek híján a hivatkozó PR-okból (nyitott → `felkesz`,
   beolvadt implementációs PR → `kesz` „becslés” jelöléssel), különben `ismeretlen`.
2. **DONTES:<terv>:<Dn>** — a specek „Döntés:” sorai; **DONTES:P-0xx / DONTES:BL-…** — a hiányleltár 4/a tulajdonosi döntései;
   **FOTERV-D1…D6** — a főterv döntési pontjai.
3. **P-001…P-068** — pótlási leltár (cél) + a 2026-11-23-i hiányleltár pillanatképe (állapot); a címben/állapotban hivatkozott, azóta
   beolvadt PR → `kesz` (ha nincs nyitott PR-ja — a nyitott PR törzsbeli hivatkozása is számít).
4. **Kurált** (`kovetelmenyek.json`): K-0xx, STUDIO_SOURCE_VISUALS, D1-HIBRID, W1, U4/U4a–e, VALTOZATOSSAG/V1–V5, MP_MODE… a munkamenet-
   üzenetekhez mintával (`patterns`), a commitokhoz/PR-okhoz (`commit_patterns`, `prs`), kanbanhoz, kapcsolóhoz kötve (`flag.expect`: a kapcsolónak BE kell lennie, a saját szabálya szerint).
5. **PR#N** — minden nyitott PR (`felkesz`); **FELADAT#id / KANBAN:tábla:id** — a kódhoz nem kötött nyitott feladatok.

Új kérés felvétele: `kovetelmenyek.json`-ba új tétel (vagy a régi `superseded_by`-ja az újra), majd `gyujt.py`.
