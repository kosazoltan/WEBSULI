# Végrehajtás: fejlesztés utáni higiénia (2026-10-14)

Spec: `docs/specs/2026-10-14-higienia.md`. A háromfázisú munkarend végrehajtási dokumentuma; parancsok a repó gyökeréből.

## T1 — ágak és worktree-k
- Lépés: ágonként a merge-base óta módosított fájlok blob-összevetése az `origin/main`-nel; eltérésnél annak igazolása, hogy az
  ágbeli változat egy mai `main`-commitban szerepelt (később felülírva), vagy a későbbi mergelt PR része (cherry-pick).
- Eredmény: 7 ág (#209, #210, #211-lezárt, #212, #213 ágai, a terv-ág és a gyerek-munkamenet ága) + 1 worktree — mind lefedve;
  törölve helyben és a GitHubon. A junction csak linkként (`rmdir`) törölve; a fő `node_modules` sértetlen (620 csomag).

## T2 — memória
- Fájlok: `memory/projects/websuli/LEDGER.md` (2026-10-14 bejegyzés), `memory/projects/websuli/BACKLOG.md` (nyitott tételek,
  titok-részletek nélkül).
- Parancs (RUNBOOK 6.): a memóriaindex-ellenőrzés → elvárt `HIANYZO: nincs`; plusz indexeletlen fájl: nincs.

## T3 — skill
- Fájlok: `.agents/skills/tananyag-keszito/SKILL.md` (terjedelmi keret), `.agents/skills/websuli-studio-tools/SKILL.md` és a
  modelleknek átadott `source/server/studio/role-skills.ts` `TOOL_SKILLS["outline-autofix"]` (dinamikus fejezetplafon) — szinkronban.

## T4 — kanban
- Fájlok: `docs/kanban.md` (a létező CLI-útvonal `D:/repo/Hermes-agent/...`, a CLI valós státuszai), `RUNBOOK.md` 9.2 → hivatkozás.
- Tábla (`%LOCALAPPDATA%/hermes/kanban.db`, repo WEBSULI): 4 lezárt PR + 6 nyitott teendő; egy tévesen létrehozott próbatétel
  megjegyzéssel lezárva (a CLI-ben nincs törlés).

## T5 — adatbázis (csak jelentés)
- Fájl: `source/scripts/measure/db-hygiene-report.mts` (ellenőrzött TLS, `BEGIN READ ONLY`).
- Parancs (`source/`-ból): `npx tsx scripts/measure/db-hygiene-report.mts` → elvárt: üres listák a nem lezárt `studio_jobs`,
  nem terminális `one_step_runs`, beragadt (`running`) workflow, esedékes `scheduled_jobs` soraira; a `waiting` külön, tájékoztató.

## T6 — mappa
- `tmp/trial-2026-10-14` (gitignore-olt) megtartva a próbaleckék kézi átnézéséhez; a gyerek-worktree üres mappája a munkamenet
  lezárása után törölhető.

## T7 — kapuk
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build` (`source/`) → mind exit 0.
