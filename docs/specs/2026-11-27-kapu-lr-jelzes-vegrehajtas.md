# Végrehajtás — KAPU-LR-JELZES (a helyi független ellenőr NEM ítélete jelzés, nem megállás)

Tulajdonosi döntés (űrlap, 2026-11-27): „A helyi Gemma-ellenőrző maradjon, de a téves jelzése ne állítsa meg a láncot (csak
jelentés)”. Ok (mért, 2026-11-27): a helyi ellenőr ugyanarra a fejre futásonként más azonosítójú, kódból cáfolható high leletet ad
(#636: `isApply` „mindig igaz” — teszt cáfolja), ezért a lánc kétszer állt meg tévesen; a PR-en közben négy külső AI-ellenőr és a CI
is lefut, a szálaik megválaszolása (merge-kapu) a valódi védelem.

1. Bukó teszt (`scripts/qa/gates/pre-merge-gate.test.mjs`): a `NEM` ítélet a PR- és a merge-kapun `WARN` (a jelentés látszik);
   a HIÁNYZÓ ítélet (az ellenőr nem futott) továbbra is `FAIL`.
2. Javítás: `scripts/qa/gates/lib.mjs` `verdictResult` — `NEM` → `WARN`, a megjegyzés a leletek kezelését (szál / PR-leírás) kéri.
3. `docs/minosegkapuk.md`: a független ellenőr szerepe — kötelező lefutni, a `NEM` jelzés.

Állapot: kész — következő: kapulánc.
