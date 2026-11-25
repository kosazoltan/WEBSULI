# Végrehajtás: B7 — tartós kimenő sor

Terv: `docs/specs/2026-11-25-eredmeny-email-b7.md` (a `docs/specs/2026-11-22-eredmeny-email-bontas.md` B7 sora).

1. **Bukó tesztek:** `tests/result-outbox.test.ts` (tárolóréteg: két fül, ismétlés, sérült kulcs, memóriasor, korhatár, induló
   ellenőrzés; a kapcsoló alapból KI); `tests/lesson-result-outbox.spec.ts` (5xx → a sorban marad → újraindításkor elmegy; 400 → törlődik;
   lejárt → törlődik; KI → nem ír a tárolóba).
2. **Zöldre hozás:** `shared/result-outbox.ts`; `client/src/lib/resultOutboxFlag.ts`; `client/src/lesson-runtime/resultReport.ts`
   (`enqueueResult`, `drainResultOutbox`); `client/src/App.tsx` (induláskori és `online` ürítés).
3. **Próbahiba:** a korhatár-ellenőrzést kiiktatva a „lejárt” teszt bukik.
4. **Kapulánc:** gate:stage → gate:push → helyi ellenőr → PR (a B5b beolvadása után).
