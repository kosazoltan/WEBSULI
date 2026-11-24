# WEBSULI — projekt-tudás

> Felhalmozott tudás. Kézzel bővítendő: új tudás / döntés / buktató ide kerül. A `GEN:` blokkokat a
> `scripts/projekt-tudas-sync.py` (Hermes-agent repó) frissíti; a többit soha nem írja felül.

## Cél
- Gyökér-manifest. Az alkalmazás a source/ alatt él (a függőségek is ott vannak); ez a fájl nem telepít semmit, csak a .github/workflows/ci.yml kapuit teszi felfedezhetővé a gyökérből — enélkül egy 369 tesztes repó úgy néz ki, mintha nem lenne futtatható parancsa. (forrás: package.json)

## Stack
- Node.js / npm (`package.json`)

## Kulcsparancsok
- `npm run check` → `npm --prefix source run check`
- `npm run check:test` → `npm --prefix source run check:test`
- `npm run lint` → `npm --prefix source run lint`
- `npm run test` → `npm --prefix source run test`
- `npm run build` → `npm --prefix source run build`
- `npm run test:e2e` → `npm --prefix source run test:e2e`
- `npm run verify` → `npm --prefix source run verify`
- `npm run gate:lint` → `node scripts/qa/gates/lint-gate.mjs`
- `npm run gate:stage` → `node scripts/qa/gates/stage-gate.mjs`
- `npm run gate:push` → `node scripts/qa/gates/pre-push-gate.mjs`
- `npm run gate:pr` → `node scripts/qa/gates/pre-pr-gate.mjs`
- `npm run gate:merge` → `node scripts/qa/gates/pre-merge-gate.mjs`

## Konvenciók
- A kötelező szabályok forrása: `AGENTS.md` (a `.hermes.md` tükrözi). Fő fejezetei: WEBSULI — Agent operating rules; Alapelvek; Agentic QA szabályok (agentic-qa-kit v1.2); Review guidelines (AI-reviewerek: Codex, Copilot, Vercel Agent); Háromfázisú munka (kötelező, tulajdonosi utasítás 2026-09-09); Befejezési mandátum (kötelező, tulajdonosi utasítás 2026-11-01); Minőségkapuk (kötelező, tulajdonosi utasítás 2026-11-17); Verifikáció; Git; Zárás; Aktív munkafázis-követés (kötelező, tulajdonosi utasítás 2026-09-05); ChatGPT/Codex programozási protokoll

## Döntések
- 2026-11-23 — a felhős „vak kör” (friss alügynök-review minden fejre) kivezetve; helyette `node scripts/qa/gates/local-review.mjs` (helyi Ollama, Ornith 9B, ANGOL prompt, ugyanaz a `review-<fej>.json` bizonyíték) — indok: 45 PR-ra 342 felhős kör (≈7,6/PR), a helyi futás ~16 s/PR, 0 token. Felhős vélemény csak kockázatos fájlnál, egyszer. A tartalmi vak megoldó (bankok) marad. Terv: `docs/specs/2026-11-23-vak-kor-kivezetes.md`.

## Buktatók
- 2026-11-23 — Mem0 (Hermes hosszú távú memória) a helyi Dockerben futó pgvector-on (`hermes-mem0-pg`, 127.0.0.1:55432); ha a `mem0_search` „not initialized” hibát ad: `docker start hermes-mem0-pg` + Ollama fut-e, majd új ülés.
- A záró vector-index inkrementális; a záró push mindig `node D:/repo/Hermes-agent/scripts/zaro-hurok.mjs push --repo D:/repo/WEBSULI` (ez frissíti az indexet), nyers `git push` után a check elavult indexet jelezhet.
- 2026-11-23 — FELADATOK MESTERE: SQL nyilvántartás (`node D:/repo/Hermes-agent/scripts/feladat.mjs list|add|set --repo D:/repo/WEBSULI`); munka elején list, minden új teendő azonnal add. A kanban csak tükör.
- 2026-11-23 — 11 tulajdonosi döntés (P-007, P-020, P-022, P-023 elvetve, P-036/P-056, P-057, P-063…P-066, withQuotaFailover): lásd `docs/specs/2026-11-23-teljes-hianyleltar.md` 4/a (ág docs/hianyleltar-2026-11-23) és az SQL-tételek jegyzetei.
- A helyi modellel csak angolul — magyar megbízást nem ért megbízhatóan; a 9B modell `high` lelete lehet hamis pozitív → kódból ellenőrizd, hamisnál `--refuted <id> --refuted-reason`.
- 2026-11-24 — Tulajdonosi kötelező utasítás: ha a CI és a pre-merge kapu zöld, a lint → push → merge → deploy engedélykérés nélkül végrehajtható (`gh pr merge --squash --match-head-commit <teljes SHA>`, előtte futásőr).
- 2026-11-24 — Advent levél (#562): `mailed_to` jelölők `want:` / `pending:<h>@<ms>` / `try:<h>@<első ms>` / `sent:<h>@<ms>` / `final:` / `check:`; az első kísérlettől 23 órán (`ADVENT_RESEND_WINDOW_MS`) túl nincs automatikus levél, a `check:` kézi egyeztetés. Advent tároló/levél-változásnál push előtt `npm run test:learning-db` (Docker) is.
- 2026-11-24 — E2E admin-fixtúra csak a `playwright.config.ts` `ADMIN_ALLOWLIST`-jén szereplő címmel (fail-open őr: listás admin mellett a listán kívüli admin 403).
- 2026-11-24 — Eredmény-e-mail kapcsoló: `RESULT_PARTIAL_EMAIL=on` (alapból KI) — a B4a-tól (körönként egy végleges levél) a B6-ig minden új szerveroldali viselkedés mögötte; a pillanatkép (`partial: true`) a B5a-0-tól SOHA nem végleges (`202 { queued:false, partial:true }`). A KI alatt elküldött körökre a BE-n legfeljebb egy további levélpár mehet (vállalt átmenet).
- 2026-11-24 — Párosítási kilét (B4b): `shared/round-owner.ts` — a token lenyomata a kör első tevékenységekor rögzül, a beküldő minden kísérlet előtt ehhez veti a mostani tokent; a fiók-címke (R31) a B7-tel jön.
- 2026-11-24 — Munkafa-higiénia: `git worktree add` + `cd` + git-parancs egy `&&` láncban (vagy `cd X || exit 1`), commit előtt `git branch --show-current`; a `zaro-hurok.mjs trap add` munkafából a fő checkoutba ír.
- 2026-11-24 — Fejlesztés közben rendszeres `git fetch` — más fejlesztő is pusholhat (pl. #572 nem e munkamenetből); merge előtt a gate is lekéri a friss main-t.
- 2026-11-24 — Szeletmenet (tulajdonosi döntés): bukó tesztek → zöldre hozás egységenként → próbahibás ellenőrzés → kapulánc → push + PR a `main`-re; minden egység után commit `Állapot: <szelet> k/n …` sorral; skill: `.hermes/skills/websuli-szeletmenet/SKILL.md`. Force-push tilos (új ágnév).
- 2026-11-24 — Őr-tesztet érintő PR-nál push ELŐTT `git merge origin/main` (különben a merge-kapu C-61 FAIL → újabb ~1 órás CI). Egy másik PR beolvasztása után a még futó CI-jű PR-ba azonnal olvaszd be a maint.
- 2026-11-24 — A `local-review.mjs` (helyi 9B modell) ugyanarra a kódra futásonként új, gyakran spekulatív high-t ad. Minden high-t kódból ellenőrizz (AGENTS.md): igazolt hibánál javítás + új ellenőrzés; `--refuted ... --refuted-reason` KIZÁRÓLAG kódhivatkozással bizonyított hamis pozitívra; új fejen a korábbi cáfolat érvényességét újra ellenőrizd, mielőtt átviszed.
- 2026-11-24 — A zárási TRAP-sort linked worktree-ből a `zaro-hurok.mjs trap add` a FŐ checkoutba írja (mainWorktree) — tudás-ágon a sort kézzel kell átvinni, a fő checkoutot visszaállítani.

## Kapcsolódó
- Hermes-projekt: `websuli` (mappa: `WEBSULI`) · Kanban-tábla: `websuli`
- Szálindex: [SZALAK.md](SZALAK.md) · Retrók: [RETRO/](RETRO/)

<!-- GEN:BEGIN tanulsagok -->
## Retrókból összegyűjtött tanulságok

_Generált (helyi LLM retrókból, deduplikálva, legújabb elöl; max. 40)._

- (még nincs retró)
<!-- GEN:END tanulsagok -->

## Tulajdonosi döntések — 2026-11-23 (H0, első kör)
- Biztonsági szűrő: a „refused by the model's safety filter" a szolgáltató (Claude bemeneti osztályozó) téves riasztása OpenRouteren át; Hermes-ből nem kikapcsolható. Megkerülés: `model.aliases.mentes = openrouter/google/gemini-2.5-pro` — blokknál `/model mentes` egy üzenetre, az Opus marad az alap.
- P-022: nyilvános élesítés az admin-próba után azonnal (PLAYER_ACCOUNTS, MP_MODE a Renderen).
- P-020: játékosfiók egyediség postafiók szerint — normalizált cím (Gmail-pont és +címke levágva) + egyedi index.
- P-063: Kockavadász J3a verziózott új pontskála; a régi ranglista/rekord külön, verziózva marad.
- P-007: a kompakt kabalasáv ÉS a maki prototípus is marad kísérletként.
