# Websuli képkészlet — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-websuli-kepkeszlet.md`. Ág: `feat/websuli-kepkeszlet`. A parancsok a `source/` mappából futnak.

1. **`design-assets/style.md`:** a közös stílusleírás és a sávonkénti képi nyelv, a szabályterv 2.3 szerint.
   - Nincs szöveg a képen.
   - Unisex, nemi sztereotípia nélkül.
   - Gyerekbarát, jogtiszta saját stílus. Más márkára és szereplőre emlékeztető elem tilos.
2. **`design-assets/prompts.json`:** tételenként `id`, `kind`, `band`, `subjects`, `keywords`, `alt`, `aspect_ratio`, `prompt`,
   `references` (más tétel-id-k), `trial` (bool).
3. **`scripts/design-assets/generate.ts`:**
   - **Kulcs:** a `process.env.OPENROUTER_API_KEY`-ből, vagy ha az nincs, a `%LOCALAPPDATA%\hermes\.env`-ből. Csak a memóriában tartja,
     nem írja ki.
   - **Kapcsolók:** `--only <id,…>`, `--trial`, `--max N` (alapértelmezés 12), `--dry-run` (csak a becsült árat és a promptokat írja
     ki).
   - **Kérés:** `POST /api/v1/images`
     `{ model: "bytedance-seed/seedream-5-0-pro", prompt, aspect_ratio, resolution: "2K", n: 1, input_references? }`.
     A referencia a jóváhagyott kép base64 data URL-je a `client/public/design/`-ból.
   - **Mentés:** `design-assets/candidates/<id>/<időbélyeg>.png`.
   - **Napló:** `design-assets/candidates/log.jsonl` (id, modell, seed, promptHash, ár, státusz). Szöveges hibaüzenetben a kulcs
     nem szerepelhet.
4. **`scripts/design-assets/review-page.ts`:** a `candidates/index.html` válogatóoldal.
   - A képek relatív útvonalon, tételenként csoportosítva.
   - Kattintásra „Ez jó” jelölés.
   - A „Kiválasztás másolása” gomb JSON-t ad: `{ id: fájl }`.
5. **`scripts/design-assets/approve.ts`:**
   - Bemenet: a kiválasztás JSON-ja.
   - Feldolgozás: `sharp` → WebP. Hős 1600 px széles, borító 1200 px, ikon és kabala 512 px.
   - Kimenet: `client/public/design/<band>/<id>.webp`, és bejegyzés a `shared/design-assets.json`-ba.
6. **`.gitignore`:** `design-assets/candidates/`.
7. **`tests/design-assets.test.ts`:**
   - a katalógus sémája (zod);
   - minden fájl létezik;
   - az `alt` nem üres;
   - az `origin` MI-generált;
   - a `band` az öt sáv egyike;
   - a `prompts.json` minden tételéhez van stílusleírás-hivatkozás;
   - a generátor kérés-összeállítója nem teszi a kulcsot a naplóba (tiszta függvény, unit).
8. **Futtatás:**
   - előbb `--trial --dry-run`;
   - majd `--trial` (≈ 1,1 USD);
   - ezután válogatóoldal a tulajdonosnak.
   - A teljes csomag csak a stílus jóváhagyása után indul.
9. **Kapuk:** tsc, check:test, lint, unit; a próbakör valódi képei; a tulajdonos jóváhagyása.
