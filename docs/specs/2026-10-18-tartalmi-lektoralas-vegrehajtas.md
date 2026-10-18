# Tömeges tartalmi lektorálás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tartalmi-lektoralas.md`. Munkakönyvtár: `source/`. Ág: `feat/tartalmi-lektoralas`.

## 1. `scripts/content-review/lib.ts` (tiszta)
- **`stripForReview(html)`:** a `<style>…</style>`, a `<svg>…</svg>` és a `data:[^"')\s]+` URI-k helyére egyetlen `⁣` jel
  kerül; a többi rész betűhű.
- **`lessonTextFields(json)`:** `[{ id: path, text }]` a szöveges levelekről; kihagyja az `id`, `kind`, `mode`, `intent`, `theme`,
  `world`, `art`, `src`, `url` kulcsú, és a 3 karakternél rövidebb vagy szóköz nélküli, azonosítónak látszó mezőket.
- **`validateFinding(f, target)`:** egyszeri pontos előfordulás, eltérő csere, ±50%-os hossz; HTML-nél nem vezethet be
  `" ' \` \\ < >` karaktert. Az eredmény `{ ok, reason }`.
- **`applyHtmlPatches(html, patches)`:** minden patch pontosan egyszer szerepel; a cserék a pozíció szerint csökkenő sorrendben
  történnek; átfedésnél a második elvetődik.
- **`applyLessonPatches(json, patches)`:** az `id` (útvonal) szerinti mezőben pontosan egyszer szereplő szöveg cseréje (mély másolaton).
- **`costUsd(model, usage)`:**
  - Haiku: 0,10 / 0,50 (≤ 100 000 tokenes prompt), fölötte 0,50 / 2,50;
  - Opus: 4 / 20 USD millió tokenenként;
  - a cache-olvasás a bemeneti ár 0,1-szerese.
- **Teszt:** `tests/content-review-lib.test.ts`, az összes függvény, a hibás esetekkel együtt.

## 2. `scripts/content-review/proofread.mts`
- **Argumentumok:** `--limit N`, `--ids a,b`, `--budget 20`, `--dry-run`, `--log <jsonl>`.
- **Kulcs:** az `ANTHROPIC_API_KEY` a környezetből, soha nem kerül kiírásra.
- **Adatbázis:** a `.env` `DATABASE_URL`-je.
  - Olvasás: a kör anyagai (`created_at < 2026-10-01`, `content_type` html vagy lesson, PDF nélkül).
  - Lecke: a legutóbb publikált `lessons` sor.
- **Anyagonként:**
  - **Hibakereső:** Haiku 5.5 (`claude-haiku-5-5`, `output_config.effort: "low"`). A rendszerprompt magyar, csak tartalmi
    hibát kér, JSON-t vár. A 100 000 karakternél hosszabb bemenet szeletekben megy.
  - **Szűrés:** `validateFinding`.
  - **Ellenőrző:** Opus 5.5 (`claude-opus-5-5`, `effort: "medium"`), a tételek környezettel, JSON-ítélet.
  - **Alkalmazás**, ha nem `--dry-run` és van megerősített tétel:
    - **HTML:** a `pg` tranzakció: `SELECT … FOR UPDATE`, hash-egyezés, `INSERT material_improvement_backups`
      (`backup_data`: id, title, content, description, classroom, content_type, display_order, user_id, created_at;
      `created_by`: az admin), `UPDATE html_files SET content`, visszaolvasás.
    - **Lecke:** `improved_html_files` jelölt (`lessonRepairSchema`: `baselineHash = repairHash(current.json)`,
      `baselineMaterialHash = materialHash(html_files sor)`, `sourceHash = repairHash({subject, classroom, concepts})`, ahogy az
      `applyStructuredImprovement` építi), majd `applyTrackedImprovement(id, adminId, megjegyzés)`.
  - **Napló:** JSONL sor (`id`, `title`, `found`, `valid`, `confirmed`, `applied`, `categories`, `costUsd`); a kész azonosítók
    újraindításkor kimaradnak.
  - **Költség:** halmozódik; ha eléri a `--budget`-et, a futás megáll.
- **Az admin azonosítója:** az első `is_admin` felhasználó `first_name = 'Kósa'` szerint (az e-mail nem kerül kiírásra).

## 3. Futtatás
1. `--limit 5 --dry-run`: minőség- és költségmérés. A találatok kézi átnézése.
2. `--limit 5`: alkalmazás, visszaolvasás, élő ellenőrzés (az anyag megnyílik, a javított szöveg látszik).
3. A becsült teljes költség ≤ 20 USD → a teljes kör `--budget 20`.

## 4. Ellenőrzés
- `tsc`, `check:test`, `eslint`, `npm.cmd test`.
- A futás végén az összesítő a naplóból.
- Szúrópróbaként egy javított anyag visszaállíthatósága: a mentés megléte a táblában (csak olvasó lekérdezés).
