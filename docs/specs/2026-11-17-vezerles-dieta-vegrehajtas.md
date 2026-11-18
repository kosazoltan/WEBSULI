# Végrehajtás: Ügynök-vezérlő anyagok diétája — 1. lépcső

Terv: `docs/specs/2026-11-17-vezerles-dieta.md`
**Állapot:** 1. lépcső folyamatban (ág: `chore/vezerles-dieta`); a 2. lépcső a kapuk-PR összevonása után.

Munkafa: `D:\repo\WEBSULI\.claude\worktrees\vezerles-dieta`. Minden parancs a munkafa gyökeréből fut.

## 1. feladat — Csapda-index

- Fájl: `docs/agent-csapdak.md`.
- Lépés: a bevezető bekezdés után `## Index (tematikus)` szakasz; témánként (Git / PR / CI; Shell és Windows; Tesztelés
  és e2e; UI / CSS / mobil; Játékmotor; Tartalom- és bankgyártás; Backend, biztonság, adat; Telepítés és éles mérés;
  Munkaszervezés) egy sor / csapda: `C-nn` + egymondatos szabály a bejegyzés „Megelőzés / Szabály” sorából. A fejléc
  kimondja: elég az indexet beolvasni, a részletet csak a releváns azonosítónál; új bejegyzéshez indexsor is kell.
- A bejegyzések szövege és sorrendje nem változik; bejegyzést nem törlünk, újat nem veszünk fel.
- Ellenőrzés:
  `node -e "const t=require('fs').readFileSync('docs/agent-csapdak.md','utf8');const h=[...t.matchAll(/^## (C-\d+) /gm)].map(m=>m[1]);const i=[...t.split('## C-01')[0].matchAll(/^- \*\*(C-\d+)\*\*/gm)].map(m=>m[1]);console.log(h.length,i.length,JSON.stringify([...h].sort())===JSON.stringify([...i].sort()))"`
  → elvárt kimenet: `72 72 true`.

## 2. feladat — Skillek

- Fájlok: `.agents/skills/tananyag-javito/SKILL.md`, `.agents/skills/tananyag-keszito/SKILL.md`,
  `.agents/skills/websuli-internet-pipeline/SKILL.md`, `.agents/skills/websuli-studio-tools/SKILL.md`.
- Lépés: a szó szerint azonos, négysoros „Befejezési mandátum” idézetblokk helyett egysoros hivatkozás, a dátummal:
  `> **Befejezési mandátum** (tulajdonosi utasítás 2026-11-01/03): félbehagyás tilos, session végén teljességellenőrzés, NOT DONE + ok + kockázat, minden hibából csapda — [`AGENTS.md`](../../../AGENTS.md) „Befejezési mandátum”.`
- `websuli-studio-tools`: a `section-patch` sor jelölése: a `server/studio/section-patch.ts` az S4b óta (d9e9c8e9) nem
  létezik — a sor marad, „(S4b óta kivezetve)” jelöléssel; a többi eszköz élő hívója az egyfutásos motor
  (`server/studio/single-run/engine.ts`, `experience-builder.ts`).
- `.claude/skills/websuli-gyartas-analitika/SKILL.md`: a 4. szakasz mandátum-bekezdése egysoros hivatkozásra.
- A `tananyag-*` „Kötelező menet” 10 pontja és a tipográfiai szakasz VÁLTOZATLAN (éles gyártás használja; a két skill
  közti ismétlés tudatosan marad, hogy mindkettő önállóan betölthető legyen).
- Ellenőrzés: `git grep -c "Befejezési mandátum" -- .agents/skills .claude/skills` → minden fájlban ≥ 1;
  `git diff --stat` → csak a fenti öt fájl a skillek közül.

## 3. feladat — Kanban-doksi

- Fájl: `docs/kanban.md`; új fájl: `docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md`.
- Lépés: a három „## Állapot — …” szakasz szó szerint átkerül az archív fájlba; a helyükön egy bekezdés hivatkozik rá
  („a tábla a hiteles forrás; a régi pillanatképek: …”). Az 5. pont mandátum-szövege egysoros hivatkozás az
  `AGENTS.md`-re, a kanban-specifikus rész (NOT DONE + ok + kockázat `note`-ként a jegyre, STANDING jegy) marad.
- Ellenőrzés: `grep -c "Állapot — 2026" docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md` → 3.

## 4. feladat — Ellenőrzések és PR

1. `git diff --check origin/main...HEAD` → üres kimenet.
2. `node scripts/qa/three-phase-check.mjs --base origin/main` → `[három-fázis] OK`.
3. `git diff --name-only origin/main...HEAD | grep -v -E '^(docs/|\.agents/skills/|\.claude/skills/)'` → üres.
4. `npm.cmd ci --prefix source --ignore-scripts`, majd a `source/`-ból
   `node --import tsx --test tests/no-real-emails-guard.test.ts tests/mojibake-guard.test.ts` → pass (ha a telepítés nem
   fér bele, NOT RUN + ok; a CI futtatja).
5. `git merge origin/main` (rebase / force-push tilos), friss `.audit-ok` a fő checkout és a munkafa gyökerében
   (külön parancsban), majd egyetlen `git push -u origin chore/vezerles-dieta`, PR nyitása; merge-et ez a futás NEM végez.
