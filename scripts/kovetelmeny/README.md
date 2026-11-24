# Követelmény-adatbázis (WEBSULI)

Egy helyen, visszakereshetően: mit kért a tulajdonos (mikor, hol, milyen döntéssel), és mi a teljesülés nyoma (commit, PR, spec,
kapcsolóállapot). A záró revízió (`.hermes/skills/websuli-kovetelmeny-revizio/SKILL.md`) ezzel veti össze az elvárt és a valós működést.

- **Adatbázis:** `%LOCALAPPDATA%\hermes\projekt-tudas\websuli\kovetelmenyek.db` (felülírható: `--db` / `KOVETELMENY_DB`).
  A repón KÍVÜL van, mert a kérésekben valódi nevek lehetnek. E-mail-cím és titok a DB-be is csak maszkolva kerül (`a***@pelda.hu`, `[TITOK]`).
- **Gyűjtő:** `python scripts/kovetelmeny/gyujt.py [--fetch] [--napok 180] [--no-gh] [--no-render] [-q]` — idempotens (≈30 s).
- **Lekérdező / revízió:** `python scripts/kovetelmeny/revizio.py <parancs>` (`allapot`, `lista`, `tetel`, `kereses`, `felulirasok`,
  `ellenoriz`, `lelet-add`, `lelet-lista`, `allit`; `--help`).
- **Kurált elvárások:** `kovetelmenyek.json` — a munkamenetek tulajdonosi kéréseiből értelmezve, összevonva (egy tétel = egy tesztelhető
  elvárás). Nyilvános repó: név, e-mail-cím, titok TILOS benne.

## Források (`sources.kind`)

| kind | honnan | ref |
|---|---|---|
| commit | `git log --all --since` (180 nap), `extra.main` = a main-en van-e, `extra.allapot` = utolsó `Állapot:` sor | teljes hash |
| pr | `gh pr list --state all` + nyitott PR-ok feloldatlan review-szálai (GraphQL) | `#N`, `#N:szal:<id>` |
| spec | `docs/specs/*.md` az `origin/main`-en (`extra.allapot`, `extra.dontes`) | útvonal |
| doc | AGENTS.md, TUDAS, SZALAK, RETRO, lesson-improvement, agent-csapdak, websuli-potlasok — `##` szakaszonként | `fájl#n` |
| trap | `.hermes/projekt/TRAP.md` soronként | `TRAP:<sha1>` |
| session | csak felhasználói üzenet: Claude Code (`~/.claude/projects/*WEBSULI*`, régi gép mentése), Hermes `state.db` (fő + profilok, csak olvasva, alügynök-ülések nélkül), Codex | `cc:/hm:/cx:<ülés>:<üzenet>` |
| kanban | Hermes `websuli` és (WEBSULI-t említő) `hermes-agent` tábla, régi `.hermes/kanban.db` (mentésből) | `tábla:t_…` |
| task | SQL feladat-nyilvántartás (`docker exec hermes-mem0-pg psql`, `feladat.tasks`, repo=websuli) | `feladat:<id>` |
| config | kapcsolók: kód-alapérték + Render env (csak `on/off/1/0`, egyébként „beállítva (érték rejtve)” / „hiányzik”) | `flag:<NÉV>` |

## Séma (az ajánlotthoz képest bővítve)

- `sources(id, kind, ref, date, title, raw_excerpt, extra JSON)` — egyedi `(kind, ref)`.
- `requirements(id, code UNIQUE, title, statement, category, origin_source_id, date, status, superseded_by, evidence, verify_hint,
  last_checked, notes, auto_status, status_source, parent, rule)`.
  - `status`: `elvart|kesz|reszben|felkesz|elfelejtett|kapcsolo_ki|felulirt|elvetve|ismeretlen`.
  - `status_source='auto'`: a gyűjtő minden futáskor újraszámolja; `revizio.py allit` után `'revizio'` → a gyűjtő nem írja felül (csak `auto_status`-t).
  - `superseded_by` = az ÚJABB követelmény `code`-ja (az újabb utasítás felülírja a régit; mindig a lánc vége számít).
  - `rule` (JSON): a kurált ellenőrzési szabály (`flag`, `grep`, `old_grep`, `prs`, `kanban`) vagy a generálás módja (`spec`, `p-tetel`, `open-pr`, `task`…).
- `requirement_links(requirement_id, source_id, relation)` — `kert|dontes|megvalositja|reszben|felulirja|teszt|kapcsolo`; minden futáskor újraépül.
- `flags(name, code_default, live_value, owner_decision, checked_at, code_ref, notes)`.
- `revisions(id, started_at, finished_at, summary)`, `findings(..., kind, severity, proposed_slice, status nyitott|megszunt|javitva, first_seen, last_seen, kulcs)`
  — `kulcs` = dedupe-kulcs (`auto:<req>:<kind>` vagy `kezi:…`); a meg nem ismétlődő automatikus lelet `megszunt` lesz.
- `meta('utolso_gyujtes')` — utolsó futás ideje, sorszámok, a nem elérhető források listája.
- FTS5: `requirements_fts`, `sources_fts` (futásonként újraépítve).

## Követelmények keletkezése

1. **SPEC:<terv>** — minden nem `-vegrehajtas` terv; státusz az `Állapot:` sorból, ennek híján a hivatkozó PR-okból (nyitott → `felkesz`,
   beolvadt implementációs PR → `kesz` „becslés” jelöléssel), különben `ismeretlen`.
2. **DONTES:<terv>:<Dn>** — a specek „Döntés:” sorai; **DONTES:P-0xx / DONTES:BL-…** — a hiányleltár 4/a tulajdonosi döntései;
   **FOTERV-D1…D6** — a főterv döntési pontjai.
3. **P-001…P-068** — pótlási leltár (cél) + a 2026-11-23-i hiányleltár pillanatképe (állapot); a címben/állapotban hivatkozott, azóta
   beolvadt PR → `kesz` (ha nincs nyitott PR-ja).
4. **Kurált** (`kovetelmenyek.json`): K-0xx, STUDIO_SOURCE_VISUALS, D1-HIBRID, W1, U4/U4a–e, VALTOZATOSSAG/V1–V5, MP_MODE… a munkamenet-
   üzenetekhez mintával (`patterns`), a commitokhoz/PR-okhoz (`commit_patterns`, `prs`), kanbanhoz, kapcsolóhoz kötve.
5. **PR#N** — minden nyitott PR (`felkesz`); **FELADAT#id / KANBAN:tábla:id** — a kódhoz nem kötött nyitott feladatok.

Új kérés felvétele: `kovetelmenyek.json`-ba új tétel (vagy a régi `superseded_by`-ja az újra), majd `gyujt.py`.
