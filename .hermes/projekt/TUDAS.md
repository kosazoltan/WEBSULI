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
- A helyi modellel csak angolul — magyar megbízást nem ért megbízhatóan; a 9B modell `high` lelete lehet hamis pozitív → kódból ellenőrizd, hamisnál `--refuted <id> --refuted-reason`.

## Kapcsolódó
- Hermes-projekt: `websuli` (mappa: `WEBSULI`) · Kanban-tábla: `websuli`
- Szálindex: [SZALAK.md](SZALAK.md) · Retrók: [RETRO/](RETRO/)

<!-- GEN:BEGIN tanulsagok -->
## Retrókból összegyűjtött tanulságok

_Generált (helyi LLM retrókból, deduplikálva, legújabb elöl; max. 40)._

- (még nincs retró)
<!-- GEN:END tanulsagok -->
