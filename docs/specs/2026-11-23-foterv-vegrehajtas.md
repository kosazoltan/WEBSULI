# Főterv — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-11-23-foterv.md`. Ez a fájl a sorrendet, a szeletenkénti lépéseket és az állapotnaplót adja; a szeletek
tartalmát a saját tervük (hivatkozva).

## 0. Minden szeletre érvényes lépéssor

1. Munkafa a főágból (vagy halmozott láncnál az előző szelet ágából); `npm.cmd ci` a `source/` alatt.
2. Régi ág átvétele: `git cherry-pick` / `git merge origin/main`; ütköző fájlnál előbb `git diff <régi alap> origin/main -- <fájl>`
   (AZONOS → a mienk). A terv-dokumentum szakasza a fájl megfelelő helyére kerül (a scratchpad `doc_insert.py` / `keep_both.py`
   mintája szerint).
3. Hibaosztály-söprés az átvett kódon, teszttel: (a) futás közbeni környezet-olvasás (`lessonVarietyEnabled()` és társai) → a futásra
   rögzített állapot; (b) amit a program kioszt, megjelenik-e a modellnek küldött KÉRÉSBEN és a mentett állapotban; (c) minden író
   hely (motor + tároló); (d) a szabály a VÉGLEGES kimeneten mérve, minden utólagos átalakítás után.
4. `npm run gate:stage` → zöld.
5. Csak ha az előtte álló, közös fájlt érintő PR már beolvadt: `npm run gate:push` → vak kör a `vak-v2` futtatóval (követő körnél
   `--previous`) → `record-review` → `npm run gate:pr -- --body-file <leírás>` → push → PR.
6. Botok leletei: mind beérkezése után javítás egy pushban; minden szálra válasz és lezárás. Új ellenőrzést kérő lelet külön jegy.
7. Zöld CI → `npm run gate:merge -- <PR>` → merge → a fő checkout `pull --ff-only` → a munkafa eltávolítása → állapotnapló.
8. Visszaperjelet / regexet tartalmazó kódot csak fájlból futó szkript vagy szerkesztő eszköz ír (C-75, C-92).

## 1. Hullámok és szeletek

### H1 — Advent (határidő november 30.; terv: `docs/specs/2026-11-18-adventi-naptar.md`)

- **A1 — PR-C (S3 naptároldal + S4 főoldali kártya):** ág `feat/advent-c-felulet-es-elesites` (munkafa `advent-c`, fej `d53178ef`,
  rögzített ítélet IGEN F). Lépés: `git merge origin/main` (ütközés: `docs/agent-csapdak.md` — mindkét oldal megmarad) → 0. lépéssor
  5-től, követő vak kör a korábbi jelentésekkel. Ha NEM: bontás S3 / S4 PR-ra.
- **A2 — S5 eredménylevél + S6 előnézet és takarító:** ág `feat/advent-s5-s6-elesites` (munkafa `advent-s6`); az A1 beolvadása után
  `git merge origin/main`, majd a teljes lépéssor. A `render.yaml` NEM változik.
- **A3 — előnézeti próba:** a tulajdonosnak űrlap (D1) az admin-előnézet elérésével és a „Bekapcsolás és kikapcsolás lépésről
  lépésre” szakasszal.
- **A4 — bekapcsoló PR:** egy sor a `render.yaml`-ban, csak a D1 igenje után.

### H2 — TGM-lánc (terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` 12–15. szakasz; `2026-11-18-tananyag-gyartas-minoseg.md`)

- **T1** #536 (S6a): zöld CI → merge.
- **T2** S6b: `feat/tgm-s6b-v2` (munkafa `tgm-s6b`), cél: scratchpad `cel-s6b.md`.
- **T3** S6c: `feat/tgm-s6c-v2` (munkafa `tgm-s6c`); a T2 beolvadása után `git merge origin/main`.
- **T4** SK2: `feat/tgm-sk2-v2` (munkafa `tgm-sk2`); a T3 után.
- **T5** D2 űrlap → mért próbagyártás (`scripts/measure/variety-measure.mts`).
- **T6 / T7** S3a, S3b: új terv-kiegészítés és végrehajtás, majd kód; D3 az S3a tervénél.

### H3 — Kapurendszer

- **K3** a vak futtató a főágra: a `vak-v2` (`chore/vak-ellenor-konvergencia`) tartalmából, két PR-ban (futtató; kapu- és
  hook-kötés + skill + `docs/minosegkapuk.md`). A `chore/vak-futtato-1/2` és a `chore/vak-ellenor-deepseek` ágak a beolvadás után
  higiéniai jelöltek.
- **K2** bizonyíték-átvitel: ha az új fej és a megítélt fej `git patch-id`-ja a kódfájlokra azonos (csak összefésülés vagy
  dokumentum változott), a merge-kapu elfogadja a korábbi ítéletet.
- **K-PR** PR-leírás generátor a kötelező szakaszokkal.
- **#513** bontása (terv-kiegészítés: mely leletek melyik rész-PR-ba) és `fix/kitakaro-elovagas` PR.

### H4 — Eredmény-e-mail (terv: `docs/specs/2026-11-22-eredmeny-email-bontas.md`)

B1b → B2 → B3 → B4 → B5a → B5b → B6 → B7 → B8, mindegyik a főágból, a `fix/eredmeny-email-kviz` ág fájljaiból kézi átvétellel.

### H5 — Kisfilm

Bontási terv-kiegészítés a `docs/specs/2026-11-22-kisfilm-videomodell.md`-hez és a `2026-11-10-kisfilm-memoria.md`-hez → rész-PR-ok →
D4 → sortörlés (mentés, 3 napos ablak ellenőrzése, a „Fejezetenként videóanyagok készítése” munkamenet értesítése).

### H6–H9

A pótlási terv 7.1 sorrendje szerint (T-1, I-1, Q-1, Q-2, Q-3, T-2; szólétra; záró hurok; játékok; a maradék).

## 2. Állapotnapló (a legfrissebb felül)

| Dátum | Szelet | PR | Főági commit | Vak körök | Megjegyzés |
|---|---|---|---|---|---|
| 2026-11-23 | TGM S6b | #537 | `49397146` | 2 (NEM, IGEN F) | a mentett try-fajta megmarad folytatáskor; jelzés a nyers darabszámból, a végleges leckén |
| 2026-11-23 | TGM S6a | #536 | `c87d1706` | 4 (NEM, IGEN F, NEM, IGEN F) | a kiosztott terv a szerzői kérésben; `sectionShapes` eredetjelző; L4, L9 jegyen |
| 2026-11-23 | TGM S2b-2 | #535 | `f7f94f22` | 3 (mind IGEN F) | 4 követő jegy a PR-ban |
| 2026-11-23 | TGM S5b | #534 | `412854e3` | 3 | L8 az S6a-ban javítva |
| 2026-11-23 | TGM S2b-1 | #533 | `ae57953a` | 7 | a kilógófelirat-ellenőrzés kikerült (külön jegy) |
| 2026-11-22 | TGM S5a | #530 | `dfe2ac50` | 3 | |
| 2026-11-22 | Eredmény-e-mail B1a | #532 | `9e292c0f` | 2 | |
