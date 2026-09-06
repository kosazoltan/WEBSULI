# Kanban-tábla — WEBSULI

A WEBSULI munkája **lokális SQLite kanban-táblán** követődik. Ez a fájl a tábla
használatát és a repo pillanatnyi állapotát írja le. A tábla a hiteles forrás —
emlékezetből soha ne jelents státuszt, mindig a `list` kimenetét idézd.

## Hol van a tábla

- **Adatbázis:** `%LOCALAPPDATA%\Hermes\kanban.db` (felülírható a `KANBAN_DB` env-vel)
- **CLI:** `D:\Hermes\skills\software-development\hermes-kanban-workflow\scripts\kanban.mjs`
- **Státuszok:** `backlog → doing → review → done`, plusz `blocked`

> **Ne keverd össze** a gyári `hermes kanban` CLI-vel: az egy több-profilos
> diszpécser-sor, gyakran üres. Egy üres gyári lista **nem** jelenti, hogy semmi
> nincs folyamatban.

## Alapparancsok

```bash
cd "D:/Hermes/skills/software-development/hermes-kanban-workflow/scripts"

node --no-warnings kanban.mjs list --repo WEBSULI      # tábla lekérdezése
node --no-warnings kanban.mjs add --repo WEBSULI --title "BUG(...): rövid leírás"
node --no-warnings kanban.mjs start <id>               # backlog -> doing
node --no-warnings kanban.mjs note <id> "bizonyíték: PR, SHA, mérés"
node --no-warnings kanban.mjs review <id>              # doing -> review
node --no-warnings kanban.mjs done <id>                # review -> done
node --no-warnings kanban.mjs show <id>                # előzmények
node --no-warnings kanban.mjs stats                    # összesítő
```

## A munkafolyamat szabálya

1. **Jegy először.** Kanban-elem *a kód előtt* jön létre; a `start` és a
   `git switch -c` egy körben. Kódolás jegy nélkül eljárási hiba.
2. **Egy elem = egy függőlegesen teljes munkaegység.** Nagyobb munkát előre bonts
   szeletekre.
3. **A lezáró jegyzet bizonyítékot tartalmaz**: PR-szám, commit-SHA, futtatott
   kapuk eredménye, reverz-mutációk, éles mérés. Bizonyíték nélküli `done` tilos.
4. **A tábla és a valóság együtt mozog.** Ha a PR mergelődött, a board ugyanabban
   a körben `done`. (2026-09-06-án a #181 `review`-ban ragadt, pedig élesben futott —
   ezt higiéniai söpréskor kell elkapni.)

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

## Állapot — 2026-09-06

Nyitott elemek:

| # | Státusz | Tárgy |
|---|---|---|
| 185 | doing | Higiéniai söprés: árva worktree, követett bundle, halott memória, RUNBOOK |
| 152 | backlog | Gyenge-modell (Qwen/Deepseek/GLM) végrehajtási fegyelem |
| 127 | backlog | Kliens hibariport HMAC-rétege elérhetetlen a böngészőből |

A Lesson Studio szeletei (LS-0 … LS-6b) és a #159–#183 hibajavítások lezárva.

## Kapcsolódás külső követőhöz

A WEBSULI-nak **nincs** külső Jira-projektje: itt a lokális tábla a hiteles
forrás. A GitHub PR-szám a lezáró jegyzetbe kerül. (Más repókban — pl.
exc-platform — a Jira KAN a hiteles, és a lokális tábla a munkapéldány; ott a
két rendszert ugyanabban a körben kell mozgatni.)
