# WEBSULI — Teljes rendszerleírás és runbook

> **Státusz:** élő (2026-09-06). Ez a dokumentum a repo egyetlen belépési pontja
> a működés, a kiszolgálás, az eszközök és az üzemeltetés megértéséhez.
> A viselkedési szabályok az `AGENTS.md`-ben vannak — ez a fájl a *rendszert*
> írja le, nem az ügynök-szabályokat.
>
> **Mérési elv:** minden állítás alatta futtatható paranccsal ellenőrizhető.
> Ha egy szám vagy útvonal nem stimmel, a dokumentum a hibás — mérj, majd javítsd.

---

## 1. Mi ez a projekt

A **WebSuli** (websuli.vip) magyar általános- és középiskolás tananyagplatform.
Tananyagokat szolgál ki, játékos gyakorlást ad (kupon-alapú játékidő), és egy
AI-gépsorral (**Lesson Studio**) tankönyvi forrásból automatikusan leckét gyárt.

- **Felhasználó:** iskolás gyerekek (1–12. osztály), szülői és admin felülettel.
- **Élesben fut**, valódi gyerekfelhasználóval. Minden éles próbálkozás óvatos:
  státusz-lekérdezés igen, adatmódosító hívás csak akkor, ha épp az a feladat.

---

## 2. Architektúra: KÉT kiszolgáló réteg

Ez a leggyakoribb félreértés forrása, ezért elöl áll.

```
                    böngésző
                       │
        ┌──────────────┴───────────────┐
        │                              │
   VERCEL (SPA)                   RENDER (API)
   websuli.vip                    /api/*  /auth/*  /dev/*
   ─ index.html, /lesson/*        ─ Express szerver
   ─ statikus assetek             ─ Drizzle ORM
   ─ headers: vercel.json         ─ helmet, CORS, CSP
                                          │
                                     NEON Postgres
```

| Réteg | Mit szolgál ki | Konfiguráció | Hogyan ismered fel |
|---|---|---|---|
| **Vercel** | SPA-héj, `/lesson/*`, statikus assetek | `source/vercel.json` | `Server: Vercel`, `X-Vercel-Id` fejléc |
| **Render** | `/api/*`, `/auth/*`, `/dev/*` | `render.yaml` | egyéb `Server` fejléc |
| **Neon** | Postgres adatbázis | `DATABASE_URL` | — |

**Következmények, amelyek már okoztak hibát:**

1. A szerveroldali middleware (helmet CSP, biztonsági fejlécek) **soha nem fut le**
   a Vercel által kiszolgált oldalakon. SPA-fejléc módosítás a `source/vercel.json`
   `headers` blokkjába megy, és az őrző teszt **azt a fájlt** olvassa
   (`tests/vercel-lesson-csp.test.ts` minta), nem a szerverkódot.
2. A Vercel és a Render deploy-órája **külön jár**. Kliens-only javítás Vercelre
   megy → a *bundle-hash* változását mérd; szerveroldali javítás Renderre → a
   folyamat *uptime* / deploy-státusz a bizonyíték.
3. Az e2e a lokális Express szerver ellen fut, ezért a zöld lokális e2e
   **nem bizonyít** Vercel-oldali viselkedést. SPA-érintő változásnál éles próba kötelező.

---

## 3. Könyvtárszerkezet

```
D:\repo\WEBSULI\
├── AGENTS.md                  # ügynök-szabálykönyv (viselkedés, kapuk, tiltások)
├── README.md                  # rövid projekt-bevezető
├── RUNBOOK.md                 # EZ A FÁJL — rendszerleírás + üzemeltetés
├── VERCEL_RENDER_TELEPITES.md # telepítési leírás a két réteghez
├── package.json               # gyökér-forwarder: npm --prefix source
├── render.yaml                # Render web service definíció
│
├── source/                    # AZ ALKALMAZÁS (itt él minden kód)
│   ├── package.json           # valódi függőségek és szkriptek
│   ├── vercel.json            # Vercel rewrites + headers (SPA CSP!)
│   ├── playwright.config.ts   # e2e; webServer a buildelt dist/index.js-t indítja
│   ├── tsconfig.json          # app típusellenőrzés (a teszteket KIZÁRJA)
│   ├── tsconfig.test.json     # teszt-típusellenőrzés (exclude felülírva!)
│   ├── client/src/            # React SPA
│   │   ├── pages/admin.tsx    # admin felület, fülekkel
│   │   ├── components/studio/ # Lesson Studio UI (NEM client/src/studio/!)
│   │   └── lesson-runtime/    # lecke-lejátszó
│   ├── server/                # Express API
│   │   ├── index.ts           # belépési pont + boot-sweepek
│   │   ├── studio/            # AI-gépsor (lásd 4. fejezet)
│   │   ├── improve/           # tananyag-okosítás + verify-html kapu
│   │   └── scripts/           # üzemeltetői CLI-eszközök (TS)
│   ├── shared/                # kliens+szerver közös típusok, tiszta view-modellek
│   └── tests/                 # node:test egységtesztek (74 fájl)
│
├── docs/
│   ├── ls-*-hasznalat.md      # felhasználói leírások szeletenként
│   ├── specs/                 # specifikációk + contract-template.yaml
│   └── archive/               # történeti anyagok (NEM élő dokumentáció)
│
├── memory/                    # Cogni memória-réteg (lásd 6. fejezet)
├── .agents/skills/            # repo-saját ügynök-skillek + Python eszközök
├── .github/workflows/         # CI: ci.yml, auto-review.yml
└── tmp/                       # gitignore-olt munkaterület (NEM commitolandó)
```

**Szabály:** a `source/` alatt nincs gyökér-`package.json` az app mellett — ezért a
gyökér `package.json` továbbít (`npm --prefix source`). A kapuk a repo gyökeréből
futtathatók.

---

## 4. A Lesson Studio gépsor

Tankönyvi forrásból (kép/PDF/szöveg) publikált leckét gyárt. Két indítási út van.

### Lépések

```
forrás → [OCR] → extract → pedagogue → (ADMIN JÓVÁHAGYÁS) → author
                                                              ↓
                              publikálás ← gate ← lektor ← animator
```

| Lépés | Feladata | Kulcsfájl |
|---|---|---|
| `ocr` | képforrás átírása szöveggé (olcsó vision-modell) | `server/studio/extractor.ts` |
| `extract` | tudás-térkép (fogalmak) kivonatolása | `server/studio/extractor.ts` |
| `pedagogue` | pedagógiai vázlat a térképből | `server/studio/step-runner.ts` |
| `author` | a lecke megírása blokkokban | `server/studio/step-runner.ts` |
| `animator` | animációs és „próbáld ki" blokkok | `server/studio/step-runner.ts` |
| `lektor` | újraolvasás, jegyzetelés — **soha nem ír át** | `server/studio/lektor.ts` |
| `gate` | séma + fedettség ellenőrzés, majd publikálás | `server/studio/step-runner.ts` |

### Két indítási út

1. **Egylépéses** (`POST /api/studio/lessons/one-step`) — feltöltés → kész lecke.
   Azonnal `202 + runId`, a haladás `GET /lessons/one-step/:runId`-en pollozható.
   Állapota a `one_step_runs` táblában perzisztálódik.
2. **Kézi, térképből** (`POST /api/studio/lessons/from-map/:mapId`) — a Studio
   panel útja. Üres törzs = a térkép saját hatóköre a forrás.
   Állapota a `studio_jobs` táblában.

### Alapelvek, amelyeket nem szabad megsérteni

- **„A gép javasol, a tanár dönt."** A vázlatot admin hagyja jóvá; a szerver a
  jóváhagyáskor **újra megméri** a fedettséget — a kliens véleménye sosem bizalmi.
- **D1: a forrás nyer.** Ha a lektor szerint a tankönyv téved, az egy *admin-only*
  jegyzet (`book_probably_wrong`); a lecke a forrás szerint marad, a gyerek ezt sosem látja.
- **A prompt-építők projektálnak.** DB-azonosító (UUID) soha nem kerülhet promptba —
  csak `{localId, examWeight}`. Egy `id` mező hozzáadása a közös típushoz már
  egyszer 0%-ra vitte a fedettséget.

---

## 5. Adatbázis

Neon Postgres, Drizzle ORM. Séma: `source/shared/schema.ts`, migrációk: `source/migrations/`.

Fontosabb táblák: `studio_jobs`, `one_step_runs`, `knowledge_maps`, `km_concepts`,
`lessons`, `lektor_notes`, `game_quiz_items`, `coupons`, `concept_results`,
`html_files`, `improved_html_files`, `material_improvement_backups`.

**Csapdák, amelyek már megfogtak:**

- `game_quiz_items.concept_id` **FK** a `km_concepts.id`-ra (UUID), miközben a
  lecke `local_id` slugot hordoz. A memóriabeli teszttárban nincs FK, ezért a
  slug átment a unit teszten és élesben bukott. **Új FK-írást valódi DB-próbával
  igazolj** `BEGIN … ROLLBACK` közt.
- **Oszlopnevet soha ne találj ki.** Kérdezd le az `information_schema.columns`-t,
  utána próbálj. (Kétszer bukott már: `name`, majd `created_at`.)
- Titkot ne írj ki: a `DATABASE_URL` dotenv-ből jön, a szkript sosem printeli.

---

## 6. Cogni memória-réteg (`memory/`)

Markdown-alapú, `memory/indexes/index.yml` által irányított tudástár.

| Gyűjtemény | Útvonal | Tartalom |
|---|---|---|
| `procedural_deploy` | `memory/procedural/deploy/` | élő deploy-eljárások (Vercel/Render/Neon) |
| `procedural_development` | `memory/procedural/development/` | fejlesztői környezet, kódelemzés |
| `semantic_technology` | `memory/semantic/technology/` | termék- és technológiai tervek |
| `projects_websuli` | `memory/projects/websuli/` | backlog, döntési napló (LEDGER), áttekintés |
| `episodic_2026` | `memory/episodic/2026/` | munkamenet-naplók |

**Az index szerződése:** csak létező, élő fájlt sorolhat fel. Ellenőrzés:

```bash
python -c "import yaml,os; i=yaml.safe_load(open('memory/indexes/index.yml',encoding='utf-8')); \
m=[c['path']+f for c in i['collections'].values() for f in c['files'] if not os.path.exists(c['path']+f)]; \
print('HIANYZO:', m or 'nincs')"
```

A halott Hostinger/VPS-infrastruktúra 29 fájlja a
`docs/archive/memory-dead-vps-20260906/` mappában van — **archiválva, nem törölve**.
A kiszolgálás Vercel+Render; a Hetzner VPS tartalék, hozzáférés a gitignore-olt
`.env.hetzner`-ben.

---

## 7. Repo-saját Python eszközök

Egyetlen helyen élnek: `.agents/skills/tananyag-javito/scripts/`.
Tananyag-HTML-t validálnak és javítanak a v7.1 specifikáció szerint.

| Szkript | Sor | Feladat |
|---|---|---|
| `validate_tananyag.py` | 270 | teljes v7.1 validáció (struktúra, kvíz, feladatok) |
| `quick_validate.py` | 94 | gyors ellenőrzés — csak a kritikus szabályok |
| `fix_tananyag.py` | 400 | automatikus javítás a talált hibákra |
| `package_skill.py` | 110 | a skill csomagolása terjesztéshez |

```bash
python .agents/skills/tananyag-javito/scripts/quick_validate.py <tananyag.html>
python -m py_compile .agents/skills/tananyag-javito/scripts/*.py   # szintaxis-ellenőrzés
```

> A repo többi Python-találata a `node_modules` alatti idegen csomagok része —
> nem a miénk, ne szerkeszd.

---

## 8. YAML-konfigurációk

| Fájl | Szerep | Vigyázz |
|---|---|---|
| `render.yaml` | Render web service | Az env-blokk **hiányos**: ha egy redeploy ebből épül újra, az AI-kulcsok eltűnhetnek, és a kód némán `isConfigured()=false`-ra esik vissza |
| `source/vercel.json` | SPA rewrites + fejlécek | Az SPA CSP **itt** él, nem a szerverben |
| `.github/workflows/ci.yml` | CI-kapuk | A `check:test` és a `--max-warnings 0` **együtt** kell maradjon |
| `.github/workflows/auto-review.yml` | automata review-trigger | — |
| `memory/indexes/index.yml` | memória-útvonalak | csak létező fájl |
| `docs/specs/contract-template.yaml` | contract-first sablon | pénzügyi/kritikus logikához |
| `shared/memory-schema-v2.yaml` | memória-séma | — |

---

## 9. RUNBOOK — napi műveletek

### 9.1 Kapuk (a repo gyökeréből)

```bash
npm run lint         # eslint --max-warnings 0   — a 0 KÖTELEZŐ, nincs baseline
npm run check        # tsc --noEmit              — app típusok
npm run check:test   # tsc -p tsconfig.test.json — teszt-típusok
npm test             # node:test, 573 teszt
npm run build        # vite + szerver build
```

**Sorrend kiadáskor:** feature-ág push → kapuk → `git merge --ff-only` →
**kapuk ÚJRA a mergelt main-en** → main push → GitHub CI → éles próbák.

### 9.2 Egy szelet életciklusa

1. Kanban-elem **először** (`kanban.mjs add` + `start`), utána ág:
   `git switch -c fix/<szám>-<név>`.
2. RED tesztek a specből nevezve; futtasd, és **lásd bukni** a várt helyen.
3. Implementáció → kapuk zöldre.
4. **Reverz-mutáció minden javítás-osztályra**: rontsd el a valódi invariánst,
   a tesztnek buknia kell. Túlélő mutáció = *finding*, nem zaj.
5. Commit a bizonyítékkal (lyuk, fojtópont, mutációk, kapuk, jegyszám).

### 9.3 Éles ellenőrzés deploy után

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://websuli.vip/api/lessons   # 200 vár
curl -s -o /dev/null -w '%{http_code}\n' https://websuli.vip/api/studio/maps # 401 vár (őr él)
curl -sD - https://websuli.vip/ -o /dev/null | grep -i '^server:'          # melyik réteg?
```

Render deploy-státusz (kulcs a Hermes `.env`-ből, sosem kiírva):

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/srv-d6h9oq9drdic73cied30/deploys?limit=3"
```

### 9.4 Hibakeresés élesben

- **A haladásjelző nem bizonyít szerver-egészséget.** Beragadt jelzőnél *előbb* a
  folyamat/szerver állapotát mérd (Render uptime, DB-sorok), csak utána gyanakodj
  a modell lassúságára.
- **A Render logokból diagnosztizálj**, ne a felületről: a `[STUDIO/...]` sorok
  adják a valódi okot. A one-step panel ismert hibája, hogy minden fázist zöldre
  fest, és a hibát a „Publikálási kapura" fogja.
- **A kliens hibariportok nem érnek célba** (`/api/error-report` HMAC-et vár,
  aminek a titka nem mehet böngészőbe). Éles SPA-hibánál konzol (F12) vagy
  lokális reprodukció production-build + Playwright.
- **Elavult bundle:** deploy után kemény újratöltés (ctrl+shift+r), különben a
  régi chunkot ítéled meg. A `main.tsx` service workert regisztrál.

### 9.5 Beragadt gépsor

Induláskor két boot-sweep zárja le az árván maradt futásokat
(`server/index.ts`): `closeOrphanedOneStepRuns()` a `one_step_runs`-ra és
`closeOrphanedStudioJobs()` a `studio_jobs`-ra. Nem-terminális státuszú sor
újraindulás után hibára záródik, hogy a kliens ne pollozzon a végtelenségig.

```sql
SELECT id, step, status FROM studio_jobs WHERE status NOT IN ('ok','error');  -- 0 sor a jó
```

---

## 10. Minőségi kapuk — miért ilyenek

- **Lint 0 figyelmeztetés.** A korábbi 971-es baseline megszűnt; nincs
  „az én változásom semleges a baseline-hoz képest" érvelés.
- **`check:test` külön kapu**, mert a `tsconfig.json` kizárja a teszteket. Az
  első változata **hazudott**: örökölte az `exclude`-ot, nulla fájlt vizsgált és
  0-val tért vissza. Minden új kaput rontással bizonyíts, mielőtt bekötöd.
- **Nincs `eslint-plugin-react-hooks`.** Ezért a korai `return` utáni hook
  átcsúszik a linten és összeomlasztja az admin oldalt (React #310). Ellenszer:
  hookok minden korai visszatérés elé + parse-alapú őrző teszt.
- **A szöveges grep hazug kapu.** Bekötést ne puszta névre ellenőrizz: vágd le a
  kommenteket, és követelj valódi, `await`-elt hívást — a kikommentezett sor
  különben átmegy (mérve, #183).

---

## 11. Amit soha

- Titkot chatbe, kódba, commitba, fájlnévbe írni. A `client_secret*.json` a
  gyökérben gitignore-olt és **soha nem volt commitolva** — így is marad.
- Tesztet gyengíteni, skipelni, küszöböt csökkenteni a zöldért.
- A `tmp/` tartalmát commitolni (gitignore-olt munkaterület).
- Éles adatot módosító próbát futtatni, ha nem az a feladat — Dominik játszik rajta.
- Ugyanazt a bukó parancsot változatlan bemenettel újrafuttatni.

---

## 12. Gyors diagnosztika

| Tünet | Első mérés |
|---|---|
| „Nem látszik a javítás" | melyik réteg? `Server:` fejléc + bundle-hash + hard reload |
| „Beragadt a gépsor" | `studio_jobs` / `one_step_runs` státusz + Render uptime |
| „Nem indul a lecke-készítés" | Render log `[STUDIO/...]`, nem a felület szövege |
| „Üres a tudástár" | van-e kliens-űrlap ahhoz a végponthoz, amire az üres állapot mutat |
| „Elszállt az admin oldal" | hook korai `return` után; parse-őr + inkognitó próba |
| „Zöld a teszt, mégis rossz" | reverz-mutáció; a zöld suite nem bizonyíték |
