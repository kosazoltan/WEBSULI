# Végrehajtási utasítás: a régi szereplős maradványok kitisztítása

Terv: `docs/specs/2026-11-19-bence-maradvany-tisztitas.md`

Munkafa: `D:/repo/WEBSULI/.claude/worktrees/bence-tisztitas`, ág: `chore/bence-maradvany-tisztitas` (alap: `origin/main` 7176046f).
Minden commit üzenete fájlból (`git commit -F`), a végén `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
Tilos: `--no-verify`, rebase, force-push, push, PR. A `gate:push` és a `gate:pr` az orkesztrátoré.

## 0. lépés — tervpár commit (az első kódcommit ELŐTT)

- Fájlok: `docs/specs/2026-11-19-bence-maradvany-tisztitas.md`, `docs/specs/2026-11-19-bence-maradvany-tisztitas-vegrehajtas.md`.
- Commit: `docs(specs): a Bence-maradvány tisztításának terve és végrehajtási utasítása`.

## 1. lépés — őr-teszt (előbb a teszt, hogy a régi állapoton bukjon)

- Új fájl: `source/tests/auto-review-workflow-guard.test.ts` (node:test + `node:assert/strict`, a gyökér:
  `join(import.meta.dirname, "..", "..")`, mint a `source/tests/gitignore-guard.test.ts`-ben).
- Esetek:
  1. a workflow `name:` sora pontosan `Auto Review`; a job neve `Trigger Sourcery + Codex review`;
  2. a szöveg tartalmazza külön sorban idézve: `'@sourcery-ai review'`, `'@codex review'`, `'@vercel run a review'`, és az
     `docs/specs/2026-10-18-atfogo-review.md` hivatkozást;
  3. a pontos `bence-auto-review` szó eltávolítása után a szöveg nem illeszkedik a `/bence|junior|merge-eli|openclaw|\bcodi\b|eszter/i`
     mintára; tartalmazza a `docs/minosegkapuk.md` és az `orkesztrator` szót;
  4. az állapotkulcs `<!-- auto-review: ${headSha} -->`, és a „már lefutott” feltétel a régi
     `<!-- bence-auto-review: ${headSha} -->` kulcsot is nézi (mindkét sablonszöveg szerepel, és a `comments.some(` kifejezés mindkét
     változót használja);
  5. `git ls-files -- .harness` kimenete üres.
- Ellenpróba: `cd source && node --import tsx --test tests/auto-review-workflow-guard.test.ts` → elvárt: BUKÁS a tisztítás előtt
  (1., 3., 4., 5. eset). A kimenet záró sorait a PR-leírás rögzíti.
- A teszt a 2–3. lépéssel együtt, egy commitban kerül be (egy bukó őr-teszt önálló commitja a köztes állapotot pirossá tenné).

## 2. lépés — a workflow tisztítása

- Fájl: `.github/workflows/auto-review.yml`.
- `name: Auto Review (Bence)` → `name: Auto Review`.
- Fejléc-megjegyzés: a „Bence agent helyett” fordulat törlése; a műveletek listája a valós működést írja le (egy indító megjegyzés
  SHA-nként; a 2. „Post-CI badge” pont törlése, mert ilyen lépés nincs a fájlban); a három bot felsorolása; egy mondat arról, hogy
  a merge-et az orkesztrátor végzi a minőségkapuk (`docs/minosegkapuk.md`) után.
- `Check` lépés: `stateKey = <!-- auto-review: ${headSha} -->`, `legacyKey = <!-- bence-auto-review: ${headSha} -->`,
  `alreadyTriggered = comments.some(c => c.body?.includes(stateKey) || c.body?.includes(legacyKey))`; a `state_key` kimenet az új kulcs.
- A megjegyzés címe: `## :robot: Auto review triggered`. A bevezető: „A review botok most futnak…”, a listában a Vercel Agent is
  (`@` említés nélkül, hogy a botot csak az indító sor szólítsa meg).
- A záró két sor helyett (egy dőlt bekezdés, két sorban):
  `_Automatikus review-indito. A merge-et az orkesztrator vegzi a minosegkapuk (docs/minosegkapuk.md) utan;`
  `a botok velemenye onmagaban nem indit merge-et._`
- A job `name`, az `on:`, a `permissions:`, az `if:` és a `Skip` lépés változatlan.
- Ellenőrzés: `node -e` YAML-olvasás helyett az őr-teszt + szemrevételezés (`git diff`); a szerkezet nem változik.

## 3. lépés — a `.harness/` négy fájljának eltávolítása

- Előtte: `git grep -n -E "\.harness/(notes|release-log|spec|verify-report)" -- . ":!.harness"` → elvárt: csak
  `memory/projects/websuli/LEDGER.md:81` (múltbeli napló, marad).
- `git rm .harness/notes.md .harness/release-log.md .harness/spec.md .harness/verify-report-B.md`.
- A `.gitignore` `.harness/backups/` és `source/.harness/` sora marad.
- Ellenőrzés: `git ls-files -- .harness` → üres; `source/tests/memory-index-guard.test.ts` zöld (a `gate:stage` futtatja).

## 4. lépés — commit és kapu

- Az őr-teszt célzott futása: `cd source && node --import tsx --test tests/auto-review-workflow-guard.test.ts` → elvárt: 5 / 5 pass.
- Commit (1–3. lépés együtt): `chore(ci): az auto-review workflow és a .harness szereplős maradványainak kitisztítása`.
- `npm run gate:stage` a munkafa gyökeréből → elvárt: zöld. Bukásnál az ok javítása, nem a mérce.

## 5. lépés — csapda-bejegyzés (önfejlesztési hurok)

- A `docs/agent-csapdak.md` közös, hozzáfűzős katalógus: a C-48 szabály szerint szelet-PR nem ír bele. A csapda-javaslat a
  zárójelentésbe és a PR-leírásba kerül, az orkesztrátor gyűjti: „a gép által írt PR-megjegyzés is élő dokumentáció; megszűnt
  szereplőre / folyamatra hivatkozó automatikus szöveg félretájékoztat; megelőzés: őr-teszt a workflow szövegére
  (`source/tests/auto-review-workflow-guard.test.ts`)”.
- A tartós műtermék ebben a PR-ban maga az őr-teszt.

## 6. lépés — PR-leírás és jelentés

- PR-leírás a munkafán KÍVÜL, az orkesztrátor által megadott scratchpad-útvonalon (`bence/body.md`): elfogadási lista (`- [x]`),
  „Futtatott ellenőrzések” (parancs + valós eredmény), „Nem futtatott + ok” (gate:push, gate:pr, független ellenőr, élő próba),
  a repó-szintű hatókör jelzése; vége: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Jelentés az orkesztrátornak: fej-hash, módosított / törölt fájlok, grep-leltár, a `gate:stage` záró sorai, NOT RUN tételek,
  maradó kockázat.
