# Spec: a régi szereplős (Bence / Junior / Codi / Eszter) maradványok kitisztítása

> Dátum: 2026-11-19 · Szerző: Claude (alügynök, az orkesztrátor megbízásából) · Állapot: JÓVÁHAGYVA (tulajdonosi kérés 2026-11-19)
> Szabály: 3+ fájlt érintő feladat csak spec + AI-olvasható végrehajtási utasítás után indul (`docs/agent-haromfazisu-munka.md`).

## 1. Cél

A tulajdonos kérése (2026-11-19): „keresd meg ezt a Bence szálat. Ez egy régi OpenClaw skill / Claude MD maradék. Tisztítsd ki a
rendszerből, mert csak lassít és félretájékoztat.”

A repóban egy korábbi, szereplős ügynökrendszer (Bence / Junior / Codi / Eszter) két maradványa él:

1. A `.github/workflows/auto-review.yml` minden PR-re olyan megjegyzést ír, amely szerint „Bence merge-eli” a PR-t, és „Junior
   javit es push-ol”. Ilyen ügynök nincs; a beolvasztást az orkesztrátor végzi a minőségkapuk után (`docs/minosegkapuk.md`,
   `npm run gate:merge`). A megjegyzést olvasó ügynököket ez félretájékoztatja.
2. A repó gyökerében a `.harness/` négy követett fájlja (2026-06 / 2026-07-es szereplős munkanapló), amelyre semmi élő nem épít.

A cél: a workflow működése változatlan marad, a szövege igaz és semleges lesz; a négy fájl kikerül a repóból (a git-történet megőrzi).

## 2. NEM cél (out of scope)

- A `source/.harness/` (gitignore-olt helyi mérőszkriptek) és a `.gitignore` sorai (`.harness/backups/`, `source/.harness/`).
- A tananyagokban, tesztekben, módszertani doksikban és mérésekben szereplő „Bence” gyereknév
  (pl. `docs/modszertan-nyitomese-jatekos-kerdezes.md`, `docs/measurements/`, `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo-vegrehajtas.md`).
- A `docs/archive/` történeti anyagai és a `memory/projects/websuli/LEDGER.md` 2026-09-01-es naplóbejegyzése (múltbeli tény
  rögzítése: akkor a `.harness/release-log.md` valóban commitolva lett).
- A review-botok köre, a workflow eseményei, jogosultságai, a job neve, a fájl neve.
- A workflow fájl-átnevezése (a `RUNBOOK.md` és a `docs/specs/2026-10-18-atfogo-review*.md` a jelenlegi névre hivatkozik).
- Push, PR, merge (az orkesztrátor ütemezi).

## 3. Érintett területek

- `.github/workflows/auto-review.yml` — módosul (név, fejléc-megjegyzés, állapotkulcs, a PR-megjegyzés szövege).
- `.harness/notes.md`, `.harness/release-log.md`, `.harness/spec.md`, `.harness/verify-report-B.md` — törlés (`git rm`).
- `source/tests/auto-review-workflow-guard.test.ts` — új őr-teszt.
- `docs/agent-csapdak.md` — NEM módosul (C-48: szelet-PR nem ír a közös katalógusba; a csapda-javaslat a zárójelentésben megy
  az orkesztrátornak).
- `docs/specs/2026-11-19-bence-maradvany-tisztitas.md` és `-vegrehajtas.md` — ez a tervpár.

Leltár (2026-11-19, `git grep -i` az `origin/main` 7176046f fején, a `source/`, `docs/archive/`, `docs/knowledge/`,
`docs/measurements/` nélkül; minta: `bence|junior|openclaw|\bcodi\b|eszter\b|secops|auto-review`):

| Találat | Döntés |
|---|---|
| `.github/workflows/auto-review.yml` 1., 3., 46., 61., 82–83. sor | tisztítás |
| `.harness/notes.md`, `release-log.md`, `spec.md`, `verify-report-B.md` | törlés |
| `RUNBOOK.md` 99. és 238. sor (`auto-review.yml`, „automata review-trigger”) | marad: igaz, szereplőt nem említ |
| `docs/specs/2026-10-18-atfogo-review.md`, `-vegrehajtas.md` (`auto-review.yml`) | marad: igaz, szereplőt nem említ |
| `memory/projects/websuli/LEDGER.md` 81. sor (`.harness/release-log.md`) | marad: múltbeli naplóbejegyzés |
| `docs/modszertan-nyitomese-jatekos-kerdezes.md`, `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo-vegrehajtas.md` („Bence”) | marad: gyereknév példában |
| `docs/specs/2026-11-18-adventi-naptar.md` („szilveszter”) | marad: téves egyezés |
| `openclaw`, `codi`, `secops` a `.harness/`-en kívül | nincs találat |
| `.agents/`, `.claude/`, `.cursor/`, `AGENTS.md`, `scripts/` | nincs találat |

A négy `.harness/` fájlra a repóban csak a fenti LEDGER-sor hivatkozik (kód, szkript, CI, skill, `AGENTS.md`, `RUNBOOK.md` nem).
A workflow nevére („Auto Review (Bence)”), a megjegyzés címére és az állapotkulcsra a workflow-n kívül semmi nem hivatkozik.

## 4. Rögzített döntések és kényszerek

- A workflow neve: `Auto Review`. A job azonosítója (`trigger-review-bots`) és neve (`Trigger Sourcery + Codex review`) változatlan.
- Új állapotkulcs: `<!-- auto-review: <sha> -->`. A „már lefutott” ellenőrzés a régi `<!-- bence-auto-review: <sha> -->` kulcsot is
  elfogadja, hogy az átálláskor (a merge előtt már megjegyzést kapott fej újrafuttatásánál) ne legyen két megjegyzés egy SHA-ra.
  Ez az egyetlen megengedett „bence” előfordulás a workflow-ban; az őr-teszt csak ezt a pontos szót engedi.
- A három indító sor betűre változatlan: `@sourcery-ai review`, `@codex review`, `@vercel run a review`.
- Az „Átfogó review” bekezdés (`docs/specs/2026-10-18-atfogo-review.md`) megmarad.
- A záró mondat: a merge-et az orkesztrátor végzi a minőségkapuk (`docs/minosegkapuk.md`) után; a botok véleménye nem indít
  automatikus merge-et.
- A megjegyzés szövege ékezet nélküli marad (a fájl eddigi stílusa; a YAML-ba ágyazott szkript kódolási kockázata nélkül).

## 5. Edge case-ek

- **Átállás:** egy PR feje a régi kulccsal már kapott megjegyzést, majd a merge után `reopened` / újrafuttatás jön ugyanarra a
  SHA-ra → a régi kulcs felismerése miatt nincs második megjegyzés.
- **Új push:** új SHA → új megjegyzés az új kulccsal (a viselkedés változatlan).
- **100-nál több megjegyzés:** a lekérdezés eddig is csak az első 100 megjegyzést nézte (`per_page: 100`, lapozás nélkül); ez
  meglévő korlát, ez a változtatás nem érinti.
- **Draft PR:** továbbra sem fut (`draft == false`).
- **A PR saját CI-ja:** a `pull_request` esemény a PR ágán lévő workflow-fájlt futtatja, így ennek a PR-nak a megjegyzése már az új
  szöveggel érkezik.
- **Őr-teszt és a régi kulcs:** a tiltott szavak ellenőrzése előtt a teszt eltávolítja a pontos `bence-auto-review` szót; minden
  más „bence” előfordulás bukás.

## 6. Elfogadási kritériumok (EARS)

- WHEN egy nem draft PR megnyílik, újranyílik, ready lesz vagy új commitot kap, THEN the workflow SHALL egyetlen megjegyzést írni
  a fej SHA-jára, benne a `@sourcery-ai review`, `@codex review`, `@vercel run a review` sorokkal és az „Átfogó review” bekezdéssel.
- WHEN ugyanarra a SHA-ra már van megjegyzés akár az új (`auto-review:`), akár a régi (`bence-auto-review:`) kulccsal, THEN the
  workflow SHALL NOT új megjegyzést írni.
- The workflow SHALL NOT tartalmazni „Bence” (a régi kulcs pontos szaván kívül), „Junior” vagy „merge-eli” szöveget, és SHALL
  kimondani, hogy a merge-et az orkesztrátor végzi a minőségkapuk (`docs/minosegkapuk.md`) után.
- The workflow neve SHALL `Auto Review` lenni; a job neve SHALL `Trigger Sourcery + Codex review` maradni.
- The repository SHALL NOT követni fájlt a gyökér `.harness/` alatt.
- WHEN a fenti feltételek bármelyike sérül, THEN a `source/tests/auto-review-workflow-guard.test.ts` SHALL elbukni.

## 7. Tesztterv

- `source/tests/auto-review-workflow-guard.test.ts` (node:test, a `*-guard.test.ts` minta szerint — a `gate:stage` minden őr-tesztet
  futtat): a 6. fejezet feltételeit méri; a `.harness/`-t `git ls-files`-szal.
  - **Futtatásos mérés** (vak ellenőr 1. kör, K-1): a két `script: |` blokkot kinyeri, és `node:vm`-ben hamis `github` / `context` /
    `core` objektummal lefuttatja. Üres lista → 1 megjegyzés; a törzs az új kulccsal kezdődik, a három indító önálló sor, benne az
    átfogó review bekezdése, nincs megszűnt szereplő és merge-ígéret, kimondja az orkesztrátori merge-et. Ugyanaz a SHA új vagy régi
    kulccsal → 0; más SHA kulcsa, SHA nélküli említés, üres törzs → 1.
  - **Szöveges, formázástűrő rögzítés:** a `pull_request` esemény típusai, a `permissions` blokk pontos tartalma, a job draft-
    feltétele, a Post / Skip lépés `if` feltétele, a `STATE_KEY` átadása, a workflow és a job neve.
  - **Tiltott nevek szóhatárral** (`\b…\b`), hogy a „Szilveszterkor”-féle szavak ne adjanak hamis bukást.
- Mutációs ellenpróba (20 eset, a scratchpadban): 16 mutáció → bukás, 4 formázási változat → zöld.
- Ellenpróba (mutáció): a tisztítás ELŐTTI workflow-n a teszt bukik (a teszt előbb készül el, mint a tisztítás commitja; a bukást a
  végrehajtás rögzíti).
- `npm run gate:stage` a munkafa gyökeréből.
- Élő próba: NOT RUN ebben a szeletben (push / PR az orkesztrátornál); a PR megnyitásakor a megjegyzés szövege a PR-on látszik.

## 8. Kockázatok / visszavonási terv

- **Repó-szintű hatókör:** a `.github/workflows/**` és a `*-guard.test.ts` a kapuk `repoWideScopes` táblázatában szerepel (C-61);
  a merge-ablakot az orkesztrátor választja.
- **YAML- / szkripthiba a workflow-ban:** a PR-okra nem érkezne indító megjegyzés (a CI-t nem buktatja, a botok kézzel indíthatók).
  Mérséklés: a szerkezet változatlan, csak szövegek és egy feltétel módosul; a PR saját futása megmutatja.
- **Visszavonás:** `git revert` a workflow-commitra; a törölt fájlok a történetből visszaállíthatók
  (`git checkout 7176046f -- .harness`).

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-19-bence-maradvany-tisztitas-vegrehajtas.md`
