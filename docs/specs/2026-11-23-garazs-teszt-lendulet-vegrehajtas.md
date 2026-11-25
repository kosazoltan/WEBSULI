# Végrehajtás — garázs-teszt lendület (terv: `docs/specs/2026-11-23-garazs-teszt-lendulet.md`)

1. `source/tests/game-meta-quality.spec.ts` `swipeUp`: elengedés előtt 3 × 40 ms álló `touchMove`; a végén `waitScrollSettled`.
2. Mérés: `--grep Vihargarázs` 7/7 zöld; a teljes spec 31/31 zöld (helyben, gate-konfiggal).

## Végrehajtási napló

- 2026-11-23 — próbált, NEM elég: (a) pozíció-nyugvásra várás a swipe után, (b) koppintás előtti látótérbe görgetés + várás —
  mindkettő után 5/7 bukott. Bizonyíték-gyűjtés (eseménynapló, swipe nélküli futás) után a lendület volt a gyökérok; a javítás után 7/7.
