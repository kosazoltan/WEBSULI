# A-5 végrehajtás — elsős felolvasás és tételátfedés

Terv: `docs/specs/2026-11-28-advent-a5-felolvasas-atfedes.md`. Ág: `feat/advent-felolvasas-atfedes`.

1. RED: `shared/advent/assignment.ts` `family?` mező; `shared/advent/christmas-validate.ts` `christmasAnswerLeaks` (a
   `validateChristmasBank` része); a hét koszorús tétel `family: "advent-koszoru"`; `tests/advent-christmas-bank.test.ts` két új teszt
   → a valódi készlet bukik (14 szivárgás).
2. GREEN: xmas-016, -069, -090, -096 átírása (1–2. évfolyamon a kérdés ≤ 80 karakter, a helyes válasz helye változatlan).
3. Felolvasás: `shared/advent/read-aloud.ts` (`adventReadAloudVisible`, `adventReadAloudText`), `tests/advent-read-aloud.test.ts`;
   `client/src/pages/AdventCalendar.tsx`: gomb a kérdés alatt (`data-testid="advent-read-aloud"`), ablakváltáskor `speechSynthesis.cancel()`.

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/advent-*.test.ts` | `fail 0` |
| `npx tsc -p tsconfig.json --noEmit` | hiba nélkül |
