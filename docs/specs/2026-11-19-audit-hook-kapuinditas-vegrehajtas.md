# Végrehajtás — az audit-hook csak a valódi `git push`-ra (2026-11-19)

Terv: `docs/specs/2026-11-19-audit-hook-kapuinditas.md`. Ág: `fix/audit-hook-kapuinditas` (a friss mainről, `14c859ee`).
Push / PR csak az orkesztrátor jelére; a nehéz kör (`gate:push`) a gép-sávban `hook-auditok` néven, a zár megszerzése után.

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. Bukó teszt: `scripts/qa/hooks/check-audit-ok.test.mjs` (új) — folyamat-szinten, eldobható git-repóban régi `.audit-ok`-kal:
   a `gate:push` alakok → enged (A1); valódi `git push` / `push --delete` → tilt, az üzenet a valós lépést írja, `qa:audit` nincs
   benne (A2); láncolt és álcázott alakok → tilt (A3); friss `.audit-ok` → enged (A4). A futtatás a javítás előtt bukik.
3. `scripts/qa/hooks/check-audit-ok.mjs`: `isPushCommand` lineáris szó-futam felismerő a két normalizált szövegen; a három
  felismerési hely (hibás bemenet, nem objektum bemenet, parancs) ezt használja; az üzenet a valós lépés.
4. Célzott tesztek (`check-audit-ok.test.mjs`, `hook-failure.test.mjs`), mutációs ellenpróba a commitolt fejen (a régi regex
   visszaírása; a normalizálás egyik ágának elhagyása; a `qa:audit` üzenet visszaírása → a teszt bukik).
5. `npm run gate:stage`; a gép-zár megszerzése (`hook-auditok`) → `npm run gate:push` → a zár elengedése; az új fej jelentése; vak
   ellenőr.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 (mutációs ellenpróba 8/8 elkapva) · [ ] 5 (kapuk — folyamatban)

## Kiegészítés — a vak ellenőr 1. köre — végrehajtás

Terv: `docs/specs/2026-11-19-audit-hook-kapuinditas.md`, „Kiegészítés”.

6. Terv-kiegészítés (ez a doksi-commit).
7. Bukó teszt (`check-audit-ok.test.mjs`: A6 a `PUSH` listában, A7 a `KAPU` listában) → `isPushSub` / `isPushProgram` a hookban.
8. Kanban: L1, L4, L5 (a kapu-hookkal közös szelet). Mutációs ellenpróba; `gate:stage`; új fej; vak visszanézés.

- [x] 6 · [x] 7 · [ ] 8
