---
name: websuli-szeletmenet
description: Use when implementing any WEBSULI slice (feature / fix / test). Strict unit order with a commit + status line after each unit.
---

# WEBSULI szeletmenet — szigorú sorrendű egységek, egységenként commit + állapotsor

Tulajdonosi döntés (2026-11-24, a proc_365a7f4bed14 módszer átvétele): félkész munka nem maradhat commit nélkül. Ok: ebben a repóban
több gép és több ügynök dolgozik (pl. a #572 más munkamenetből jött), a munkafák között parancsláncolási hiba is előfordult, és a
diagnosztikai / félkész változások commit nélkül elveszhetnek vagy rossz ágra kerülhetnek.

## Sorrend (kötött)

1. **Bukó tesztek (RED)** — a szelet elfogadási tételeihez teszt, a megvalósítás ELŐTT; mérd, hogy bukik. → commit (`test: … (RED)`).
2. **Zöldre hozás egységenként (GREEN)** — egy egység = egy elfogadási tétel / egy logikai változás; minden egység után a hozzá tartozó
   tesztek zöldek. → commit egységenként.
3. **Próbahibás ellenőrzés** — a kész megvalósításba szándékos hibát teszel (pl. a feltétel megfordítása, a javítás egy sorának
   visszaállítása `git stash -- <fájl>` vagy ideiglenes szerkesztés), és megméred, hogy a teszt bukik; utána visszaállítod. Az eredmény
   (melyik teszt bukott, mire) a commit-üzenetbe / PR-leírásba kerül. Ha nem bukik: a teszt nem véd — javítsd, mielőtt továbblépsz.
4. **Kapulánc** — `npm run gate:stage` → `npm run gate:push` → `node scripts/qa/gates/local-review.mjs` (high leletet kódból igazolni /
   cáfolni) → `npm run gate:pr -- --body-file <út>`. Megkerülni tilos.
5. **Push és PR** — a WEBSULI-ban az integrációs ág a `main` (nincs `dev`); push → PR a `main`-re → zöld CI + `gate:merge` → merge.

## Állapotsor (minden commit után)

- A commit-üzenet utolsó sora: `Állapot: <szelet> <k>/<n> egység kész — következő: <egység>` (az utolsó egységnél `— kész, következő:
  kapulánc`). Így bármely gépen / ügynöknél a `git log -1` megmondja, hol tart a szelet.
- A SQL-feladat jegyzete ugyanezt kapja: `node D:/repo/Hermes-agent/scripts/feladat.mjs set <id> --repo D:/repo/WEBSULI --note "…"`.
- Diagnosztikai (nem szállítandó) kódot ne hagyj commit nélkül a szelet ágán: vagy külön `wip/diag-*` ágra commitold, vagy állítsd
  vissza (`git checkout -- <fájl>`), mielőtt továbblépsz. Lépés előtt `git status --short` legyen üres (vagy csak a most commitolandó).

## Munkafa-fegyelem

- `git worktree add <út> -b <ág> origin/main && cd <út> && git branch --show-current` EGY `&&` láncban; commit / cherry-pick előtt
  `git branch --show-current`. A fő checkout (`D:/repo/WEBSULI`) mindig `main`, abba nem commitolunk.
- Force-push tilos (a felülírandó ág helyett új ágnév, pl. `…-v2`).
- Rendszeres `git fetch`: idegen commit a main-en → beolvasztás push / merge előtt.

## Modell és megállás

- Hosszú, többegységes futás Opus-modellen (a GPT kétszer korán leállt). GPT-nek írt briefben kötelező: mérhető DONE-lista, és szó
  szerint: „a nagy terjedelem és a részleges eredmény nem ok a megállásra; ne kérdezz, amíg minden DONE-tétel nincs ellenőrizve”.
  (Lásd: `AGENTS.md` „GPT goal contract”.)
- Megállni csak tulajdonosi döntésnél, tiltott megkerülésnél vagy valódi akadálynál szabad (egy kipróbált, hatókörön belüli alternatíva után).
