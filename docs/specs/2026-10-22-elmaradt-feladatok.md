# Elmaradt feladatok lezárása (2026-10-22) — terv

**Tulajdonosi kérés (2026-10-22):** „Olvasd be az elmaradt, nincs kész fejlesztési részeket, és a repó szabályai szerint tervezd meg, majd
szeletenként javíts mindent teljesen pontosan, ellenőrizd le, majd mérd meg. Autonóm módon engedélyt kapsz a lint, push, merge, deploy
feladatok elvégzésére.”

## Felmérés (kódból, kanbanból és éles, csak olvasó lekérdezésből)
| Tétel | Állapot | Bizonyíték |
|---|---|---|
| Kanban #2: az 5 „0” kategóriájú régi anyag 9–12. évfolyamon | **nyitott** | `html_files.classroom` 9/11/12, a mentés (`material_improvement_backups`) szerint az eredeti 0 |
| PR #271 kétszínű fókuszgyűrű | **nyitott, ütközik** | 10-17 óta nyitott, `mergeStateStatus: DIRTY` |
| Futó javítás / okosítás leállítása | **hiányzik** | nincs végpont; 10-22-én csak adatbázis-írással lehetett leállítani |
| Kanban #3, #10 | kész | #353 (javítókör 4,04 → 1,25), #355 |
| Kanban #4 lektori kivétel | kész (mérve) | ciklus 8: 0,42 kivett tétel/anyag (kiinduló 2,17) → −80%; a maradék 172 jegyzet tartalmi fogás |
| „Telling the Time” okosítási hiba (10-20) | okafogyott | az anyagot a régi-anyag sor 10-21-én teljesen újragyártotta és publikálta |
| Kanban #5 ellenőrzés-költség (ciklus 8: 20,8%, 26 kör/anyag, a költség a kimenet) | **tulajdonosi döntés** | az egyetlen kar (alacsonyabb effort) minőségi kockázat — csak fizetős A/B méréssel (memória: legacy-migration-cycles) |
| 1120 katalógus / tantárgyi memória A/B | **tulajdonosi döntés** | fizetős mérés |
| 1118 „két függő fogalom” | nem azonosítható | a tétel nem nevezi meg a leckét |

## Szeletek
- **S1 — adatjavítás:** az 5 anyag (`945c11c2`, `8c971f9e`, `fec9e07c`, `3b26ab36`, `2f7fd2f0`) évfolyama vissza 0-ra a `html_files`-ban,
  a lecke JSON-jában és a tudásbankban (`knowledge_maps`). Feltételes UPDATE (csak ha a mentés szerint az eredeti 0), egy tranzakcióban;
  visszaolvasás.
- **S2 — PR #271:** újraalapozás a mainre, a tesztek (egység + Playwright) újrafuttatása, összevonás.
- **S3 — „Leállítás” gomb:**
  - Végpont: `POST /api/studio/workflows/:id/stop` (admin, CSRF; csak a saját futás).
  - Az adatbázisban, feltételesen (`running` / `waiting`):
    - a bérlet törlődik;
    - a futás állapota `error` lesz, „A futást a tulajdonos leállította.” hibaüzenettel;
    - a revízió lép, így a motor a következő mentésnél vagy szívverésnél megáll, bármelyik példányon fut;
    - a hozzá tartozó `improved_html_files` sor `error` állapotot kap, ugyanezzel a megjegyzéssel.
  - Az okosítás hibakezelője a leállított sor megjegyzését nem írja felül.
  - A felület: a `WorkflowPhaseBar` futó / várakozó állapotban „Leállítás” gombot mutat, megerősítéssel.

## Nem-cél
A #5 és az 1120 fizetős A/B mérése (tulajdonosi döntés); a már futó modellhívás azonnali megszakítása (a leállítás a következő
lépéshatáron érvényes — legfeljebb egy hívás).

## Elfogadás (EARS)
- HA az admin a futó okosításnál / javításnál a „Leállítás”-ra kattint és megerősít, AKKOR a futás legfeljebb a következő
  lépéshatárig fut, az állapota „hiba: a tulajdonos leállította”, a lecke tartalma nem változik.
- HA a futás már befejeződött, AKKOR a végpont 409-cel válaszol, és nem módosít.
- HA az S1 lefutott, AKKOR az 5 anyag mindhárom helyen 0-s évfolyamú.
