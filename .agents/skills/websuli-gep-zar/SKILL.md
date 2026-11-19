---
name: websuli-gep-zar
description: WEBSULI gépi zár - a nehéz körök egy sávban, érkezési sorrendben futnak. Töltsd be automatikusan MINDEN nehéz kör ELŐTT (npm ci, teljes npm test, böngészős / e2e kör, DB-tesztek, gate:push, gate:pr, mutációs és CPU-terheléses próbák, a vak futtató run_e2e / run_db_tests eszköze), és ha egy teszt csak párhuzamos terhelésnél bukik. Parancs - node scripts/qa/machine-lock.mjs run --name <név> --timeout-min <perc> -- <parancs>; állapot - node scripts/qa/machine-lock.mjs status.
---

# Gépi zár — nehéz körök sorban (kötelező, tulajdonosi utasítás 2026-11-19)

> „Keress a jelentkező időzítési bukásokra megoldást: hogyha két nehéz kapu fut egyszerre a gépen, akkor vagy állítsd sorba őket, vagy
> javítsd meg a nehéz futás sikeres elvégzését.” — a tulajdonos választása: **sorba állítás, egy sáv**.

Szabály: `AGENTS.md` „Gépi zár”. Runbook: `docs/minosegkapuk.md` „Gépi zár”. Terv: `docs/specs/2026-11-19-gepi-zar.md`. Csapdák: C-80…C-85
(`docs/agent-csapdak.md`).

## Miért

Két nehéz kör egyszerre a gépen időzítésfüggő bukást okozott (kanban #205: 60,6 s a 60 s-os korláttal szemben; #206:
`setTimeout`-sorrend) — önmagukban zöld tesztek, hamis piros kapu, elvesztegetett kör.

## Mi számít nehéz körnek

`npm ci` / `npm.cmd ci`, a teljes `npm test` (gyökérből vagy `source/`-ban), böngészős / e2e kör (`test:e2e`, Playwright), DB-tesztek
(`test:learning-db`, eldobható Postgres-konténer), `gate:push`, `gate:pr`, `verify`, mutációs ellenpróba-sorozat, CPU-terheléses
mérés, a vak futtató `run_e2e` / `run_db_tests` eszköze. Nem nehéz: `gate:stage`, `gate:lint -- --fast`, egy-két célzott tesztfájl,
`git`, `gh`, a `status`.

## Hogyan

| Mit | Parancs (a munkafa gyökeréből) |
|---|---|
| Nehéz kör a zár alatt | `node scripts/qa/machine-lock.mjs run --name <név> --timeout-min <perc> -- <parancs> [arg…]` |
| Ugyanez npm-mel | `npm run machine-lock -- run --name <név> --timeout-min <perc> -- <parancs>` |
| Állapot (gazda, futási idő, sor) | `node scripts/qa/machine-lock.mjs status` (gépi alak: `--json`) |
| Kapuk (maguktól a zár alatt) | `npm run gate:push`, `npm run gate:pr -- --body-file <út>`, gyökér `npm test`, `npm run test:e2e`, `npm run test:learning-db`, `npm run verify` |

Példák: `node scripts/qa/machine-lock.mjs run --name npm-ci-gepzar --timeout-min 20 -- npm --prefix source ci --ignore-scripts`;
`node scripts/qa/machine-lock.mjs run --name mutacio-c80 --timeout-min 30 -- node scratch/mutacio.mjs`.

- `--name`: rövid, beszédes (ág / feladat), a `status`-ban ezt látják a többiek.
- `--timeout-min`: a leghosszabb várható futásidő + tartalék; lejártakor a szkript a SAJÁT gyerekét leállítja (124).
- `--max-wait-min <perc>` (nem kötelező): ennyi várakozás után a sorból kilép, a parancs nem fut (75). Alapból vár, amíg sorra kerül.
- A `run` várakozás közben 60 másodpercenként kiírja a helyét a sorban és a gazdát. Hosszú várakozásnál a parancsot háttérfolyamatként
  indítsd (pl. `run_in_background`), és a kimenetét / a `status`-t figyeld (aktív munkafázis-követés) — a futtatást NE add át
  „majd később” valaki másnak.
- A zár helye: `<git-common-dir>/websuli-machine-lock/` (a fő checkout és minden munkafa ugyanazt látja). `WEBSULI_MACHINE_LOCK_DIR`
  csak tesztben / kivételes esetben. CI-ben (`CI=true`) a zár kikapcsol.
- Újrabelépés: a zár alatt futó parancs gyereke (pl. a `gate:pr` belső `npm run build`-je) a `WEBSULI_MACHINE_LOCK_HELD` tokennel nem
  vár a szülőre. Ezt a változót kézzel beállítani tilos (csak a jelenlegi gazda tokenje érvényes; hamisnál a `run` figyelmeztet és
  sorba áll).

## Kilépési kódok

A parancsé; `124` időtúllépés; `130` Ctrl+C; `143` SIGTERM; `75` a várakozási korlát lejárt (a parancs NEM futott); `127` a parancs
nem indítható; `2` használati hiba / a zár-mappa nem állapítható meg (a parancs NEM futott — nincs csendes, zár nélküli tartalék).

## Foglalt zár

1. `node scripts/qa/machine-lock.mjs status` — ki fut, mióta, mi az időkorlátja, ki áll előtted.
2. Várj a sorban (a `run` magától indul, amikor sorra kerülsz). Előzni, a sorfájlt kézzel írni, a zárat törölni TILOS.
3. A várakozás alatt végezz könnyű munkát (doksi, célzott teszt, review-válasz, csapda-bejegyzés) — passzív várakozás helyett.

## Elavult zár

A `run` maga ismeri fel és veszi vissza (naplózva: `<zár-mappa>/events.log`), ha (a) a gazda és a gyereke ugyanazon a gépen nem él,
(b) a kezdés + időkorlát + türelmi idő (alap 10 perc) lejárt, vagy (c) a zár-mappában 60 s után sincs gazda-fájl. Élő folyamatot SOHA
nem öl meg. Kézi törlés helyett: futtasd a saját `run`-odat, az dönt. Ha a `status` „ELAVULT”-at mutat, de senki nem áll sorban, a
következő `run` visszaveszi.

## Hibakeresés

- **„nem a jelenlegi gazdáé” figyelmeztetés:** örökölt / kézzel beállított `WEBSULI_MACHINE_LOCK_HELD` — töröld a változót a héjból.
- **A `status` élő gazdát mutat, de a gép üresjáratban van:** a gazda vagy a gyereke még él (`Get-CimInstance Win32_Process -Filter
  "ProcessId=<n>"` / `ps -p <n>`). Ha az a TE saját, beragadt futásod: a saját `run` folyamatodat állítsd le pontos PID alapján
  (Ctrl+C a terminálban vagy a háttérfolyamat leállítása) — az elengedi a zárat. Más folyamatát ne állítsd le; szólj az
  orkesztrátornak.
- **Windows: a futás kemény leállítása** (TerminateProcess) után a zár addig foglalt, amíg a gyerek él; utána elavult, a következő
  `run` visszaveszi. Az árván maradt gyereket csak a gazdája állíthatja le, pontos PID alapján.
- **Teszt csak párhuzamos terhelésnél bukik:** nézd meg, futott-e közben zár nélküli nehéz kör (`events.log`, `status`), és vedd fel a
  kanbanba a teszt időzítési gyengeségét (pl. #205, #206) — a tesztet gyengíteni tilos.

## Tilos (mért csapdák, `docs/agent-csapdak.md`)

- **C-80** — „Csak zároló” várakozó (zárat szerez, de nem futtat; az ügynök közben befejezi a futását): a zár 1 óra 40 percig üresen
  állt. A zárat CSAK a `run` szerezheti meg, és azonnal futtat.
- **C-81** — A sorrend előzése (a „bárki, aki a sorban van” szabály): érkezési sorrend (FIFO), a sorfájlt csak a szkript írja.
- **C-82** — Futó bash-szkript szerkesztése (a bash bájtpozíció szerint olvas tovább): futó szkriptet nem módosítunk; új fájlnév.
- **C-83** — Mintaillesztéses folyamatleállítás (`pkill -f`, `Stop-Process` név / parancssor szerint): idegen folyamatokat ölt meg.
  Folyamatot csak a sajátodat, pontos PID alapján (rokon: C-77 a kapu-gyorsítás / telefonos ágon).
- **C-84** — Helyi idő UTC helyett a figyelőben: minden időbélyeg és lejárat UTC (`Z`), a különbség `Date.now()`-ból.
- **C-85** — Zár nélküli nehéz eszköz (a vak futtató `run_e2e` / `run_db_tests`): minden nehéz kör a `run` alatt, más MI-eszköznél is.
