# Terv — a „vak kör” (felhős független alügynök-ellenőrzés) kivezetése, helyi GPU-ellenőrrel

Tulajdonosi utasítás (2026-11-23): „Vizsgáld meg, hogy a repóban alkalmazott vakköröknek van-e értelme … csak égetik a tokeneket.
Keress jobb megoldást helyi scriptekkel, a helyi videokártyán futtatott ügynökkel (vele kizárólag angolul). Ha jónak látod, vezesd ki
a vak ellenőr mintát; a javítás éljen a repóban.”

## Mérés (2026-11-23, helyi bizonyíték-tár és git-napló)

- 2026-11-17 óta **45 PR** került a mainre; a `websuli-qa-evidence` tárban **342 `review-<fej>.json`** ítélet van → **≈ 7,6 felhős
  ellenőr-kör / PR** (minden javító push új fejet, új teljes kört kért; a dokumentumok 1.–4. vak kört említenek).
- Egy kör: friss kontextusú Opus-alügynök, a teljes diff + spec + ellenőrzőlista olvasása → nagyságrendileg 100 ezer+ token / kör.
- Haszon: a körök találtak valódi hibát (pl. #504 M1, #538 szóhatár), DE a leletek döntő része olyan osztály (regex-szóhatár, sorrend,
  hiányzó őr, gyengített teszt), amit determinisztikus teszt / lint vagy egy olcsó helyi modell is megfog; a 2.–4. kör jellemzően már
  csak az előző kör javításának apró hibáit kereste.
- Helyi próba: Ornith-1.5-9B Q8_0 (RTX 5090 Laptop, Ollama) egy eltávolított nullaosztás-őrt 8 s alatt, helyesen, `high` leletként
  jelzett; felhős token: 0.

## Döntés

- **D1** A kötelező felhős „vak kör” (minden PR előtt + minden javító push előtt friss alügynök) **megszűnik**.
- **D2** Helyette kötelező a **helyi ellenőr**: `node scripts/qa/gates/local-review.mjs` — a diffet fájlonként a helyi GPU-modellnek
  adja ANGOL megbízással, és ugyanabba a `review-<fej>.json` bizonyítékba rögzít (a `pre-pr-gate` / `pre-merge-gate` változatlanul
  olvassa). Új fejre újrafuttatás ingyenes.
- **D3** A `high` leletet az orkesztrátor a kódból ellenőrzi: valódi → javítás; hamis → `--refuted <id> --refuted-reason "…"`.
- **D4** Felhős második vélemény (Claude-alügynök vagy Gemini `external-review.mjs`) **csak** a script által kockázatosnak jelölt
  fájloknál (migráció/séma, auth/token, fizetés, e-mail, CI-workflow) **ajánlott, egyszer / PR**, visszaellenőrző körök nélkül; nem kapu.
- **D5** Megmarad: a tartalmi **vak megoldó** (kvíz-/szóbank tételek vak megoldása) — az tartalom-minőségmérés, mért haszonnal
  (`docs/measurements/*vakmegoldo*.md`), nem kód-review. Csak a kód-review „vak kör” mintája megy ki.
- **D6** Ha a helyi modell nem érhető el (3-as kilépés), a régi út (`websuli-fejlesztesi-ellenor` skill + `record-review.mjs`)
  tartalékként használható, egy körrel.

## Hatókör

`scripts/qa/gates/local-review.mjs` (+ teszt), `AGENTS.md` és `.hermes.md` tükör „Minőségkapuk” 3–4. pont, `docs/minosegkapuk.md`,
skillek: `.agents/skills/` + `.claude/skills/` `websuli-fejlesztesi-ellenor`, `websuli-pr-elotti-kapu`, `websuli-merge-elotti-kapu`,
`.cursor/rules/minosegkapuk.mdc`. A kapu-kód (`lib.mjs`) nem változik: a bizonyíték formátuma azonos.
