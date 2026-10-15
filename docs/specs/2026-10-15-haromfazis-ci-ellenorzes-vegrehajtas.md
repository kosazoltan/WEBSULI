# Végrehajtási utasítás — a háromfázisú rend CI-ellenőrzése

Terv: `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md`. Ág: `docs/dontesek-2026-10-15`.

## 1. `scripts/qa/three-phase-check.mjs` (új, a `pr-size-check.mjs` mintájára; `execFileSync`, shell nélkül)
- Exportált tiszta függvény: `decideThreePhase({ files, commits, readFile, exists })` →
  `{ ok: boolean, reason: string, warning?: string }`, ahol
  - `files`: `[{ path, added, deleted }]` (a `git diff --numstat <merge-base>...HEAD` sorai),
  - `commits`: időrendben `[{ sha, files: string[] }]` (`git log --reverse --no-merges --name-only <merge-base>..HEAD`),
  - `readFile(path)`, `exists(path)`: a végrehajtási fájl tartalma, a tervfájl léte.
- Szabály a tervben (kód-útvonalak, kis javítás ≤ 1 fájl és ≤ 20 sor, végrehajtási fájl, tervhivatkozás, sorrend).
- CLI: `node scripts/qa/three-phase-check.mjs [--base origin/main]` → kiírja az okot; bukásnál `exit 1`.

## 2. `.github/workflows/ci.yml`
Új job `three-phase` (csak `pull_request`): `actions/checkout@v4` `fetch-depth: 0`, Node 22, `node scripts/qa/three-phase-check.mjs --base origin/${{ github.base_ref }}`
(a repó gyökeréből; függőség nélkül).

## 3. Teszt: `scripts/qa/three-phase-check.test.mjs` (`node --test`, függőség nélkül)
- E1: 3 kódfájl, nincs végrehajtási fájl → bukás „nincs végrehajtási utasítás”.
- E2: végrehajtási fájl a 2. commitban, kód az 1.-ben → bukás „sorrend”.
- E3: 1 kódfájl, 12 sor → átmegy figyelmeztetéssel.
- Végrehajtási fájl, de nem hivatkozik létező tervre → bukás.
- Csak dokumentum/teszt → átmegy.
- Helyes PR (terv + végrehajtás az 1. commitban, kód a 2.-ban) → átmegy.
- Futtatás: `node --test scripts/qa/three-phase-check.test.mjs`; a saját PR-en: `node scripts/qa/three-phase-check.mjs --base origin/main`.
