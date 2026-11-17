# Kanban-tábla — WEBSULI

A WEBSULI munkája **lokális SQLite kanban-táblán** követődik. Ez a fájl a tábla
használatát és a repo pillanatnyi állapotát írja le. A tábla a hiteles forrás —
emlékezetből soha ne jelents státuszt, mindig a `list` kimenetét idézd.

## Hol van a tábla

- **Adatbázis (2026-11-03, mérve):** a repóban, `<git toplevel>/.hermes/kanban.db` (gitignore-olt).
  Feloldási sorrend a CLI szerint: `--db PATH` > `$HERMES_WORKFLOW_KANBAN_DB` > `<git toplevel>/.hermes/kanban.db`.
  A CLI a `HERMES_HOME` (`%LOCALAPPDATA%\hermes`) alatti táblát **elutasítja**; a régi
  `%LOCALAPPDATA%\hermes\kanban.db` a Hermes-diszpécser sora, WEBSULI-jegy nincs benne.
- **CLI:** a `hermes-kanban-workflow` skill `scripts/kanban.mjs` fájlja. Gépenként máshol van, ezért a
  `HERMES_KANBAN_CLI` környezeti változó mutasson rá (a skill-mappában keresd a `kanban.mjs`-t).
  (2026-11-03: a korábban ide írt, géphez kötött `D:\…` útvonalak elavultak — ezért nincs itt abszolút útvonal.)
  **A WEBSULI gyökeréből futtasd**, különben a CLI egy másik repó tábláját nyitja meg (csapda C-02).
- **Státuszok (a CLI `stats` szerint):** `todo → doing → review → done`, plusz `blocked`.
- A korábban hivatkozott #6–#11 jegyek (köztük a #11 STANDING) az új táblán nincsenek — hollétük UNKNOWN;
  a mandátum STANDING jegye az új táblán újra fel van véve.

> **Ne keverd össze** a gyári `hermes kanban` CLI-vel: az egy több-profilos
> diszpécser-sor, gyakran üres. Egy üres gyári lista **nem** jelenti, hogy semmi
> nincs folyamatban.

## Alapparancsok

```bash
cd "$(git rev-parse --show-toplevel)"    # a repó gyökeréből!
K="$HERMES_KANBAN_CLI"                    # a saját gépen: …/hermes-kanban-workflow/scripts/kanban.mjs

node --no-warnings "$K" list                         # tábla lekérdezése
node --no-warnings "$K" add --title "BUG(...): rövid leírás"
node --no-warnings "$K" start <id>                   # todo -> doing
node --no-warnings "$K" note <id> "bizonyíték: PR, SHA, mérés"
node --no-warnings "$K" review <id>                  # doing -> review
node --no-warnings "$K" done <id>                    # review -> done
node --no-warnings "$K" show <id>                    # előzmények
node --no-warnings "$K" stats                        # összesítő
```

## A munkafolyamat szabálya

1. **Jegy először.** Kanban-elem *a kód előtt* jön létre; a `start` és a
   `git switch -c` egy körben. Kódolás jegy nélkül eljárási hiba.
2. **Egy elem = egy függőlegesen teljes munkaegység.** Nagyobb munkát előre bonts
   szeletekre.
3. **A lezáró jegyzet bizonyítékot tartalmaz**: PR-szám, commit-SHA, futtatott
   kapuk eredménye (a `gate:push` / `gate:pr` összesítő táblája — `docs/minosegkapuk.md`), reverz-mutációk, éles mérés.
   Bizonyíték nélküli `done` tilos.
4. **A tábla és a valóság együtt mozog.** Ha a PR mergelődött, a board ugyanabban
   a körben `done`. (2026-09-06-án a #181 `review`-ban ragadt, pedig élesben futott —
   ezt higiéniai söpréskor kell elkapni.)
5. **Befejezési mandátum (tulajdonosi utasítás 2026-11-01; szövege: `AGENTS.md`).** Megkezdett jegyet félbehagyni
   tilos; objektív blokkolónál a jegyre `note`: NOT DONE + ok + kockázat. A szabály a mandátum STANDING jegyén áll
   (a régi #11 az új táblán nincs, újra fel van véve — lásd fent).

## Elnevezési minta

| Előtag | Mikor |
|---|---|
| `BUG(terület):` | hibajavítás — a mért tünettel a címben |
| `LS-<n>:` | Lesson Studio szelet |
| `SEC:` | biztonsági javítás |
| `DX:` | fejlesztői élmény, kapuk, CI |
| `HIGIENIA:` | takarítás, elavult tartalom kivezetése |
| `REGRESSZIO(#n):` | korábbi jegy visszaesése |
| `STANDING(binding):` | tartós szabály, nem záródik le |

## Állapot

A hiteles állapot a CLI `list` kimenete. A régi pillanatképek (2026-10-05, 2026-10-18, 2026-11-02, köztük a
2026-11-02-i tulajdonosi döntések táblája) szó szerint: `docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md`.

## Kapcsolódás külső követőhöz

A WEBSULI-nak **nincs** külső Jira-projektje: itt a lokális tábla a hiteles
forrás. A GitHub PR-szám a lezáró jegyzetbe kerül. (Más repókban — pl.
exc-platform — a Jira KAN a hiteles, és a lokális tábla a munkapéldány; ott a
két rendszert ugyanabban a körben kell mozgatni.)
