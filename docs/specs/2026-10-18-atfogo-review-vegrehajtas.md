# Átfogó review — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-atfogo-review.md`.

1. **`AGENTS.md`:** új szakasz a „Review-evidencia” után: `### Review guidelines (AI-reviewerek: Codex, Copilot, Vercel Agent, Sourcery)`.
   - Teljes PR és az érintett programrészek, nem csak a legutóbbi diff.
   - Szeletes funkciónál a terv és a már összevont szeletek is, végponttól végpontig.
   - Kötelező szempontok:
     - adatszerződés a lépések között;
     - biztonság és adatvédelem: token, titok, személyes adat, CSRF / origin;
     - regresszió a meglévő folyamatokban;
     - időzóna és dátumhatár;
     - migráció és Drizzle-séma;
     - indítás / cron / leállítás és e2e-mód.
   - Csak fájl:sor és hibaforgatókönyv evidenciával.
   - Szeletes funkciónál az utolsó szelet összevonása előtt átfogó review kötelező, az eredménye PR-kommentként.
2. **`.github/copilot-instructions.md`:** rövid magyar utasítás, ugyanezek a pontok, hivatkozással az `AGENTS.md` szakaszára.
3. **`.github/workflows/auto-review.yml`:** a trigger-komment szövege kiegészül egy „Átfogó review” sorral (a teljes PR + a funkció
   egésze + az érintett programrészek; lásd `AGENTS.md` Review guidelines). A `@codex review` / `@sourcery-ai review` sorok
   változatlanok.
4. **Ellenőrzés:**
   - `node --test scripts/qa/three-phase-check.test.mjs`;
   - a workflow YAML szintaxisa: `node -e` YAML-parse, ha van parser; különben NOT RUN, indoklással;
   - a PR-ben a trigger-komment megjelenése.
