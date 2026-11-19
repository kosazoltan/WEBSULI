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
  - indítás / cron / leállítás;
  - félkész munka: a PR-hoz tartozó spec és `-vegrehajtas.md` minden pontja teljesült-e (befejezési mandátum);
  - ARM64 + x64: architektúra-függő útvonal, bináris vagy csak egy CPU-n települő függőség.
- **Evidencia:** csak fájl:sor hivatkozással és konkrét hibaforgatókönyvvel jelezz hibát.
- **Vak hibakereső ellenőr** (AGENTS.md „Vak hibakereső ellenőr — kötelező”): a PR-leírásban a `Független ellenőr ítélete: … (fej: <hash>)` sor a JELENLEGI fejre
  szóljon; ha hiányzik vagy régi fejre szól, jelezd.
  Ki az ellenőr (AGENTS.md „Ki az ellenőr” bekezdés): KIZÁRÓLAG a gépi futtató — `npm run gate:blind-review` (skill: `websuli-vak-ellenor`), modell `openai/gpt-6.2-sol`, high (tulajdonosi döntés 2026-11-19); `blindReview.exclusive` BE: alügynök vagy kézzel írt jelentés nem ad ítéletet; ha a futtató nem fut le, a munka megáll, a tulajdonos dönt.
