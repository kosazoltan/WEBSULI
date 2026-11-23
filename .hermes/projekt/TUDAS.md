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
- ismeretlen (ide: dátum — döntés — indok)

## Buktatók
- ismeretlen (ide: tünet — ok — megoldás)

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
