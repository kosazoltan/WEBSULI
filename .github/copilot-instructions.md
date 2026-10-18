# Copilot — review-utasítás (WEBSULI)

Magyarul válaszolj. A részletes szabály az `AGENTS.md` „Review guidelines” szakasza (a kezelt blokkon kívül) (`docs/specs/2026-10-18-atfogo-review.md`).

- **Kör:** a review a TELJES PR-re és a diff által érintett programrészekre szól, nem csak a legutóbbi push diffjére.
- **Szeletes funkció** (a PR leírásában „S1–Sn”): a funkció tervét (`docs/specs/…`) és a már összevont szeleteket is nézd,
  végponttól végpontig.
- **Kötelező szempontok:**
  - adatszerződés a lépések között;
  - biztonság és adatvédelem: token, titok, személyes adat; CSRF / origin;
  - regresszió a meglévő folyamatokban;
  - időzóna (Europe/Budapest);
  - migráció ↔ séma;
  - indítás / cron / leállítás.
- **Evidencia:** csak fájl:sor hivatkozással és konkrét hibaforgatókönyvvel jelezz hibát.
