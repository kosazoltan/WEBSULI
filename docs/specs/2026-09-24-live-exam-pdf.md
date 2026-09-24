# Élő próba: felvételi feladatlap PDF → gyakorló tananyag (2026-09-24)

Tulajdonosi kérés: vadonatúj tananyag élesben a `M6_2021_1_fl_1.pdf` (2021-es 6. évfolyamos központi felvételi feladatlap) alapján, cím és utasítás nélkül; a folyamat kódszintű követése, a téves működések javítása.

## Cél
- Az egylépéses útvonal (`runOneStep`) felismeri a tárgyat, évfolyamot és a tananyag típusát (feladatlap → gyakorló lecke).
- A futás közben mért, KÓDBÓL eredő téves működések javítása mért bemenettel.

## Nem-cél
- A bankmodellek tartalmi hibáinak kézi javítása (azt a lektor/kapu kezeli).
- A PDF-szövegréteg (pdfjs) törtjeinek visszaállítása — a kivonatoló modell helyesen rekonstruálta (2/5, 1/5, 2/15).

## Mért leletek
| # | Lelet (log / DB) | Ok | Javítás |
|---|---|---|---|
| 1 | c15 definíció: „Olyan számot kell keresni, რომლის harmada…” (grúz szó) | a kivonatoló modell idegen írásba csúszott; a hibás-fogalom javító nem nézte | `foreignScriptLetters` + célzott javítás a `completeExtractionConcepts`-ben (forrásban szereplő írás és görög betű engedett) |
| 2 | Bankcsomag bukott: „2 = 980 : 2”, „2 = 490”, „2 = 7,5” — helyes `(500 + 480) : 2 = 490` mintákra | a lánc-minta a zárójel UTÁNI számtól is indult | a lánc előtt álló művelet / zárójel → kifejezés-közép, nem ítéljük meg; a „Nem:” címke kettőspontja (előtte nem szám) nem művelet |
| 3 | „1/15 = 4” (a teljes út 1/15-e 4 km) hibának jelölve | hányad = mennyiség jelölés | tört = egyszerű szám + mértékegység → nem számolási állítás; tört = tört továbbra is ellenőrzött |
| 4 | A futás 2607 s után: „Elfogyott a lépés javítási kerete: Ábrák és gyakorlóbankok” → felhasználónak „Váratlan hiba”, a job „running”-ban árván | 3 szerzői kör (r0–r2) után a futtató még 2 csak-bank kört engedett (`MAX_BANK_ONLY_ROUNDS`), a workflow animátor-kerete 4 → 5. látogatás kivétel. A `pipeline.ts` komment („r0 + bank + author + bank = 4”) invariánsa ezen az úton nem tartott | a csak-bank kör a FUTÓ workflow hátralévő keretét nézi (`workflowStepVisitsLeft`); elfogyott keretnél a lektor tiszta, okot megnevező hibával zár. A keret (4) és a (q) teszt 2 csak-bank köre változatlan |
| 5 | Lektor r2–r3: „Réka és Janka is 273 kiskockát épített” — csak a bankot jelölte | a SZERZŐ oldotta meg rosszul a 9. feladatot (7×11×5 = 385; helyesen 7·(h−1) = 35 → 7×11×6 = 462, Réka 70, Janka 280); a lektor a lecke részeredményéből indult, így csak-bank javítás jött, ami nem konvergálhatott | lektor skill 5. pont: forrásfeladatot minden adattal önállóan megoldani; ellentmondó részválasznál a tanítás blockPath-ját jelölni (7. pont) |
| — | Valódi hibák, amelyeket a rendszer helyesen fogott: „60 : 5 = 6”, a lektor r0 a négyjegyű számlistán (2324, 2423 hiányzott) | — | — |

A #2–#3 hamis riasztások jó csomagokat buktattak: tartalék modell + mentőkör (gpt-5.6-terra) → lassabb, drágább futás.

## Edge case-ek
- `Nem: 12 · 2 = 48 téves.` → továbbra is hiba (meglévő `section-patch` teszt).
- `(500 + 480) : 2 = 490, és 3 · 410 = 1320` → csak a második hiba.
- `9/30 = 1/3 rész` → hiba marad.
- `K = 2·r·π, α` → görög betű nem idegen írás; cirill a forrásban → engedett.

## Elfogadás (EARS)
- HA a lánc előtt számot/zárójelet követő műveleti jel áll, AKKOR az őr nem jelez.
- HA egy fogalom term/definition mezője a forrásban nem szereplő, nem latin/görög betűt tartalmaz, AKKOR a kivonatoló célzott javítást kér.
- HA a csak-bank kör a workflow keretén túl lenne, AKKOR a lektor hibával zár (nem kivétel, a job nem marad „running”).
- Tesztek: `tests/live-exam-pdf-2026-09-24.test.ts` új, `lesson-pipeline-runner` (q3) új, `tests/section-patch.test.ts` változatlanul zöld; kapuk: tsc (+test), eslint, teljes teszt, build, CI.
