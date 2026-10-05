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

## Állapot — 2026-10-05

A CLI `list` a hiteles forrás; ez a pillanatkép a 2026-10-05-i higiéniai söprés után készült.

| # | Státusz | Tárgy |
|---|---|---|
| 1113 | done | TUDÁSBANK S2–S4 — PR #189, #193; éles import: 201 lecke, 17 bank, 23 209 sor |
| 1114 | done | S9/S10 orkesztrátor, streamelés, automatikus folytatás — PR #190–#192 |
| 1115 | done | S11 OCR: bizonytalanság, szótár-őr, két erős olvasó fúziója — PR #192, #194, #195, #197 |
| 1116 | done | BANK determinisztikus normalizálás + kapu-javítás adagolva — PR #196; élő lecke 13f2102b |
| 1117 | done | BUG(lecke-adat): „jeggyel” kvízkulcs — éles javítás |
| 1118 | backlog | TANÁRI JAVÍTÁS: lecke 13f2102b két függő fogalma |
| 1119 | backlog | DÖNTÉS: nyitott PR #182 |
| 1120 | backlog | TUDÁSBANK S6 → S5 → S7 → S8 |
| 560 | backlog | BUG(web-research): tudásbázis nélkül készülő internetes HTML |
| 187 | backlog | BUG(autoBackup): szerverindulásonkénti mentés |
| 152 | backlog | Gyenge-modell végrehajtási fegyelem (STANDING) |
| 127 | backlog | Kliens hibariport HMAC-rétege |

Higiénia 2026-10-05: a review-ban ragadt #189/#191/#196/#197 és a doing #999 bizonyítékkal lezárva, a #202 duplikátum zárva;
munkafák (s10, s11, s116, continuous-release) eltávolítva; 107 beolvasztott helyi és 121 távoli ág törölve, a nem beolvasztott
`backup/pr-128-*` ágak `archive/*` tagben; a gyökér- és `source/` naplók a `tmp/_archiv-2026-10-05/` alá kerültek.

## Kapcsolódás külső követőhöz

A WEBSULI-nak **nincs** külső Jira-projektje: itt a lokális tábla a hiteles
forrás. A GitHub PR-szám a lezáró jegyzetbe kerül. (Más repókban — pl.
exc-platform — a Jira KAN a hiteles, és a lokális tábla a munkapéldány; ott a
két rendszert ugyanabban a körben kell mozgatni.)
