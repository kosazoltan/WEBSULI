# Végrehajtás — vak, hibakereső független ellenőr; a külső (Gemini) ellenőr kikerül a kapukból

Terv: `docs/specs/2026-11-18-vak-hibakereso-ellenor.md`. Ág: `chore/vak-hibakereso-ellenor`. Push / PR csak az orkesztrátor jelére,
a #506 összevonása és friss főág-beolvasztás után.

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. Kapuk: `scripts/qa/gates/pre-pr-gate.mjs` és `scripts/qa/gates/pre-merge-gate.mjs` — a „külső (Gemini) ellenőr — második
   vélemény” lépés, az `externalResult` import, a `decideMerge` `external` paramétere és a `readEvidence(ctx.evDir, 'external-…')`
   hívás törlése; `scripts/qa/gates/lib.mjs` — az `externalResult` függvény törlése; `scripts/qa/gates/external-review.mjs` —
   fejkomment: a kapuk nem olvassák a `--record` bizonyítékot (kézi, nem kötelező eszköz).
3. `scripts/qa/gates/record-review.mjs`: a `buildRecord` hibával tér vissza, ha a jelentésben nincs `Fej:` sor, vagy az utolsó `Fej:`
   sor hash-e nem a rögzített teljes fej előtagja, vagy hiányzik a „Mit próbáltam megtörni, és nem sikerült” vagy a „Mit NEM
   vizsgáltam” fejléc (`#`–`######`). A hibaüzenet megnevezi a hiányzó elemet és a skill sablonját.
4. Tesztek (a terv „Teszt-változások” pontjai szerint): `pre-merge-gate.test.mjs`, `external-review.test.mjs`,
   `record-review.test.mjs`; új `scripts/qa/gates/vak-ellenor.test.mjs` (forrás- és szöveg-őr).
5. Dokumentumok: `docs/minosegkapuk.md` — a „Külső (Gemini) ellenőr” szakasz törlése, a független ellenőr vak + hibakereső
   előírása (egy szakasz, a skillre mutatva); `AGENTS.md` „Minőségkapuk” 3. pont + a Gemini-bekezdés törlése;
   `.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md` — vak, hibakereső megbízás-sablon (a)–(f), a 4/b szakasz törlése, a 6.
   szakasz a kötelező jelentés-elemekkel; `.claude/skills/…` tükör (bájtra azonos — `skills-sync-check`).
6. `npm run gate:stage`; mutációs ellenpróba commit után (a három `record-review` feltétel egyenkénti kivétele; a „külső” lépés
   visszaírása a kapuba → a teszt bukik); `npm run gate:push`; fej-hash az orkesztrátornak.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 · [x] 6

## Kiegészítés — repó-szintű, környezet-semleges szabály (2026-11-18) — végrehajtás

Terv: `docs/specs/2026-11-18-vak-hibakereso-ellenor.md`, „Kiegészítés” fejezet.

7. Ez a doksi-commit (a terv kiegészítése + ez az alfejezet), a kód előtt.
8. `AGENTS.md`: önálló „## Vak hibakereső ellenőr — kötelező” szakasz a „Minőségkapuk” elé, a kezelt blokkon kívül (tulajdonosi
   idézetek, dátum, környezet-semleges előírás); a „Minőségkapuk” 3. pontja rövid hivatkozás.
9. Vezérlőfájlok (a terv táblázata szerint): `.cursor/rules/vak-ellenor.mdc` (új, `alwaysApply: true`),
   `.cursor/rules/minosegkapuk.mdc`, `.cursorrules`, `.github/copilot-instructions.md`, `docs/agent-haromfazisu-munka.md`,
   `docs/codex-felhokornyezet.md` — rövid, kötelező hivatkozás az AGENTS.md szakaszára.
10. Skill (`.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md` + `.claude/skills/…` tükör): leírás minden elkészült fejlesztésnél
    betöltésre; „Ha nincs alügynök-eszköz” szakasz; a sablon marad.
11. `scripts/qa/gates/pr-verdict-check.mjs` (+ `pr-verdict-check.test.mjs`): GitHub-eseményből a PR-leírás ítélet-sora a fejre.
12. Őr-teszt (`scripts/qa/gates/vak-ellenor.test.mjs` bővítése): az AGENTS.md szakasz kulcsmondatai; minden érintett vezérlőfájl
    hivatkozik rá; a skill leírása. `gate:stage`, mutációs ellenpróba, `gate:push`, fej-hash az orkesztrátornak.

- [x] 7 · [x] 8 · [x] 9 · [x] 10 · [x] 11 · [ ] 12 (kapuk, mutáció — folyamatban)
