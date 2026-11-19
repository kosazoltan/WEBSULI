# Végrehajtás: ítélet-rögzítés a záró `Fej:` sorhoz kötve (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-20-itelet-fej-egyeztetes.md` · Ág: `fix/itelet-fej-egyeztetes` · Munkafa: `.claude/worktrees/itelet-fej`

Minden pont ELŐBB bukó teszttel; commit-üzenet fájlból.

1. Ez a doksi-commit (terv + végrehajtás + a PR-2 terve: `docs/specs/2026-11-20-osszefesult-proba.md`), a kód előtt.
2. Teszt (`scripts/qa/gates/record-review.test.mjs`): fej-sor nélküli jelentés → hiba; rövid hash a `Fej:` sorban → hiba; más fejű záró
   `Fej:` → hiba; régi `Fej:` + későbbi szabad szövegbeli új hash → hiba (nem az új fej); az utolsó `Ítélet:` a záró `Fej:` előtt →
   hiba; review + visszaellenőrzés szakasz (`Fej: régi` / `Ítélet: NEM` / `Fej: új` / `Ítélet: IGEN`) → jó, `reportHead` = új fej.
   A meglévő tesztek jelentés-fixture-jei `Fej:` sort kapnak (dokumentált spec-változás).
3. Kód: `scripts/qa/gates/record-review.mjs` — `reportHeadLine(text)` (az utolsó önálló `Fej:` sor teljes hash-e és a sor indexe),
   `buildRecord` ellenőrzései, `reportHead` a rekordban.
4. Doksi: `.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md` + `.claude` tükör (a jelentés-sablon és a visszaellenőrzés `Fej:`
   sora), `docs/minosegkapuk.md` („Ismert korlátok” / bizonyíték: a `record-review` fej-egyeztetése).
5. Ellenőrzés: `node --test scripts/qa/gates/record-review.test.mjs scripts/qa/gates/lib.test.mjs`; `node scripts/qa/gates/skills-sync-check.mjs`;
   gép-zárral `npm run gate:stage`.
