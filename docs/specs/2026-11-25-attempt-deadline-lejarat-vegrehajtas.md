# Végrehajtás: a kísérlet-határidő lejárata végleges (CI-flake: attempt-deadline)

Terv: `docs/specs/2026-11-25-eredmeny-email-b5b.md` (a B5b pillanatkép-küldés teljes kísérlet-határideje, review #602 — `shared/attempt-deadline.ts`).

Kiváltó ok: a #610 és a B8 kapuláncán az `attempt-deadline.test.ts` időzítésfüggően bukott (`1 !== 0`, 13. sor). A `shared/attempt-deadline.ts`
`within` lejárati időzítője a Node-ban a `Date.now`-hoz képest ms-kerekítéssel **korábban** is tüzelhet; lejárat után a `left()` ekkor 1-et adott 0 helyett,
így a lejárt kísérlet (B5b pillanatkép-küldés) 1 ms-os időkorláttal még elindíthatta a POST-ot.

1. **Bukó teszt:** `tests/attempt-deadline.test.ts` — kézzel léptetett óra, az időzítő 1 ms-mal a határidő előtt fut le; a `within` után a `left()` pontosan 0.
2. **Zöldre hozás:** `shared/attempt-deadline.ts` — a lejárati időzítő lefutása végleges (`lapsed`), utána a `left()` mindig 0.
3. **Próbahiba:** a `lapsed` ágat kivéve az új teszt újra bukik.
4. **Kapulánc:** önálló kis PR a main-re; utána a #610 (J7b) újrafuttatása a javított main-nel.
