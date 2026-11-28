# FLAKE-ASTEROID-WHY — a „Miért?” kártya tesztje az ismétlődő kérdésszövegnél (terv, 2026-11-28)

Mért hiba: a #649 CI-je kétszer bukott a `tests/remaining-learning.spec.ts:79` („asteroid wrong-answer explanation”) tesztjén:
a játék a 7. évfolyam bankjából a „Ki írta az Egri csillagokat?” kérdést adta (magyarázat: `grade-07.ts:127`), a teszt viszont
a kérdésszöveg ELSŐ előfordulását (`grade-06.ts:152`, más magyarázattal) várta. A kérdésszöveg több bankban is szerepel, a kérdés
véletlenszerű — ezért ingadozó. A játék helyes (a kérdés saját magyarázatát mutatja); a teszt kereséseé a hiba.

Döntés: a teszt az azonos szövegű kérdések BÁRMELYIKÉNEK magyarázatát elfogadja (a megjelenített kérdés szövegéből nem dönthető el
egyértelműen a forrás). Alkalmazáskód nem változik.

Végrehajtás: `docs/specs/2026-11-28-flake-asteroid-why-vegrehajtas.md`.
