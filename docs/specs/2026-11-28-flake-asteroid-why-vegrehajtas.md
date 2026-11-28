# FLAKE-ASTEROID-WHY — végrehajtás (2026-11-28)

Terv: `docs/specs/2026-11-28-flake-asteroid-why.md`.

1. Teszt: `source/tests/remaining-learning.spec.ts` — `bank.find` helyett `bank.filter`; a „Miért?” szöveg az azonos szövegű
   kérdések bármelyikének magyarázatát tartalmazza (RegExp-alternatíva, escape-elve).
2. Ellenőrzés: a spec a 7. évfolyamos játékon lefut; a két bank-bejegyzés azonos kérdésszövege igazolt (grep).
