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

- [ ] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6
