# Végrehajtás — kapu-hook `onFailure: "block"` + az audit-hook fail-closed időtúllépése

Terv: `docs/specs/2026-11-18-hook-onfailure.md`. Ág: `chore/hook-onfailure-tilt` (a friss mainről). Push / PR csak az orkesztrátor jelére.

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. `.claude/settings.json`: a két `check-quality-gates.mjs` bejegyzésre `"onFailure": "block"` (a többire nem).
3. `scripts/qa/hooks/check-quality-gates.mjs`: a „nem válaszolt” tiltás üzenete: „próbáld újra néhány másodperc múlva ugyanazt az
   egyszerű parancsot; ha tartós: docs/minosegkapuk.md — A kapu-hook hibája”.
4. `scripts/qa/hooks/check-audit-ok.mjs`: a git-hívás hibájánál a `noAnswer` jellegű hiba (időtúllépés, indítási hiba, jelzés) →
   tiltás teendővel; gyors, nem nulla kilépés → enged (nem repó); a külső `catch` a push-parancsra tilt (a bemenet olvashatatlansága
   továbbra is enged — ott nincs parancs).
5. `scripts/qa/hooks/hook-failure.test.mjs` (új): F1 a valódi settings-ből; F2 folyamat-szinten (git nélküli PATH, illetve kimerített
   keret a tesztes felülírással) — tiltás + teendő; F3 / F4 az audit-hookra folyamat-szinten (git nélküli PATH push-ra → tilt;
   nem push → enged; nem repó → enged).
6. `docs/minosegkapuk.md`: „A kapu-hook hibája” szakasz — mit jelent az `onFailure: block`; elromlott hooknál az ügynök csak a
   hookot javíthatja (Edit / Write, teszttel), különben megáll és a tulajdonostól kér segítséget; a védelem kikapcsolása kizárólag a
   tulajdonos lépése; az audit-hook időtúllépéskor tilt. Szöveg-őr teszt: a szakaszban nincs ügynöknek szóló eltávolítási utasítás.
7. `npm run gate:stage`; mutációs ellenpróba commit után (az `onFailure` sor törlése, az audit fail-open visszaírása, az üzenet
   teendő-része → a teszt bukik); független ellenőr; `gate:push` / `gate:pr` a jelre.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 · [x] 6 · [x] 7

## Kiegészítés — a vak ellenőr leletei (2026-11-18) — végrehajtás

Terv: `docs/specs/2026-11-18-hook-onfailure.md`, „Kiegészítés” fejezet.

8. Ez a doksi-commit, a kód előtt.
9. L1: `check-quality-gates.mjs` `detectGated` lineáris szkenneléssel; teszt (≥ 200 KB, < 1 s, ENGED) + ellenpróba a régi felismerővel.
10. L2: `enforce-repo-rules.mjs` `path` / `removes` mező; `scripts/qa/repo-rules.json` négy szabály; teszt a három próbára és a hook-javításra.
11. L5 / L8: `check-audit-ok.mjs` biztonságos mezőolvasás; `.claude/settings.json` az audit-hook korlátja 20 s; tesztek.
12. L7 / L9: szöveg-őr kiterjesztése; a runbook és a terv nem nevezi meg a kikapcsoló beállítást; pipálás.
13. `gate:stage`, mutációs ellenpróba, sorompó, `gate:push`, fej-hash.

- [x] 8 · [x] 9 · [x] 10 · [x] 11 · [x] 12 · [ ] 13 (kapuk — folyamatban)
