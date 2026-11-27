# GAMEQUIZ-PROMPT-KOZOS — a játékkvíz-generátor a közös gyakorlatiassági szabályt kapja (terv, 2026-11-27)

Szülő terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (egy szabály egy helyen: `shared/practice-rules.ts`). Forrás: review #640.

A régi HTML-ág játékkvíz-generátora (`server/gameQuizGeneratorService.ts`) saját GYAKORLATIASSÁG / meta-tilalom szöveget épít; a
`PRACTICE_BANK_RULE` későbbi változása így nem érné el. Döntés: a két saját sor helyére a közös `PRACTICE_BANK_RULE` kerül; a
játékspecifikus kiegészítés (csak meta-adatból üres tömb) marad.

Végrehajtás: `docs/specs/2026-11-27-gamequiz-prompt-kozos-vegrehajtas.md`.
