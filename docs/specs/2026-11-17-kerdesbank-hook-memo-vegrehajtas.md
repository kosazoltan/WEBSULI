# Végrehajtás: `useMaterialQuizzes` referencia-stabil kimenete

Spec: `docs/specs/2026-11-17-kerdesbank-hook-memo.md`. Munkafa: `.claude/worktrees/kerdesbank-memo`, ág `perf/kerdesbank-hook-memo`
(`origin/main`-ről). A parancsok a munkafa gyökeréből futnak, PowerShellből az `npm.cmd` / `npx.cmd` alakkal.

## T1 — Tiszta szűrőfüggvény és memoizálás a hookban

Fájl: `source/client/src/hooks/useMaterialQuizzes.ts`.

1. Import: `useMemo` a `react`-ból.
2. Modul-szintű állandók: `const EMPTY_ITEMS: MaterialQuizItem[] = Object.freeze([]) as unknown as MaterialQuizItem[];` és
   `const EMPTY_MATERIALS: MaterialQuizResponse["materials"] = Object.freeze([]) as unknown as MaterialQuizResponse["materials"];`.
3. Exportált tiszta függvény:
   `export function selectPlayableMaterialItems(items, topicFilter?): MaterialQuizItem[]` — a törzs a régi IIFE
   tartalma: `uniqueQuizContent(items.filter(isPlayableQuestion))`, majd ha van `topicFilter`, `filter((i) => (i.topic ?? "").toLowerCase() === topicFilter)`.
4. A hookban: `const data = q.data;` `const rawItems = data?.items ?? EMPTY_ITEMS;` `const materials = data?.materials ?? EMPTY_MATERIALS;`
   `const items = useMemo(() => (data ? selectPlayableMaterialItems(data.items ?? EMPTY_ITEMS, topicFilter) : EMPTY_ITEMS), [data, topicFilter]);`
5. A visszatérési objektum mezői változatlanok (`grade`, `materials`, `items`, `rawItems`, `isLoading`, `isError`).

Ellenőrzés: `npx.cmd --prefix source tsc -p source --noEmit` (vagy a repó `check` szkriptje) → 0 hiba.

## T2 — Teszt

Fájl: `source/tests/material-quizzes-hook-memo.test.ts`.

1. Mintagenerátor: determinisztikus (LCG), ≥ 3000 tétel: játszható 4-opciós, nem játszható (2 opció, rossz `correctIndex`, üres prompt), ismétlődő
   prompt+opció tartalom, topic-ok `english` / `English` / `math` / `nature` / `hungarian` / `null` / hiányzó.
2. AC4: minden `topicFilter`-re (`undefined`, `english`, `math`, `nature`, `hungarian`) `JSON.stringify(selectPlayableMaterialItems(sample, f))`
   === a régi képlet `JSON.stringify`-ja (a teszt a régi képletet helyben írja le az `isPlayableQuestion` és `uniqueQuizContent` közvetlen
   hívásával).
3. Hook-környezet: jsdom (`new JSDOM("<!doctype html><div id=root></div>")`), a `globalThis.window/document/navigator` beállítása,
   `IS_REACT_ACT_ENVIRONMENT = true`; `QueryClient` (`retry: false`), `setQueryData(["/api/games/material-quizzes", grade, "recent"], data)`.
   A `fetch` egy bukó csonk (a teszt hálózatot nem használhat; ha hívódna, a teszt bukik).
4. AC1: próbakomponens rögzíti az `items` / `rawItems` / `materials` referenciát minden renderben; egy állapot-léptetővel 6 újrarenderelés
   (`act`); elvárás: mindhárom referencia mind a 6 renderben azonos, és az `items` tartalma egyezik az AC4 képletével. A szűrés futásszáma: a
   lekérdezés-adat `items` tömbjének saját (nem felsorolható) `filter` tulajdonsága számláló, amely az `Array.prototype.filter`-t hívja tovább;
   elvárás: az első számítás után a számláló 6 újrarenderelés alatt nem nő (a hook kódjába tesztkampó nem kerül).
5. AC2: `setQueryData` új adattal → új `items` referencia, helyes tartalom; `topicFilter` prop váltása (`undefined` → `english`) → új referencia,
   helyes tartalom; visszaváltás → helyes tartalom.
6. AC3: letiltott lekérdezés (`grade = null`, nincs `lessonId`) → 5 újrarenderelésben azonos, üres `items` / `rawItems` / `materials`.

Parancs: `cd source; node --import tsx --test tests/material-quizzes-hook-memo.test.ts` → minden teszt `ok`.

## T3 — Mutációs ellenpróba (AC5)

Commit UTÁN: a hook másolatán (`git stash` NEM; ideiglenes szerkesztés a commitolt fájlon, utána `git checkout -- <fájl>`, ami a commitolt
állapotot állítja vissza) a `useMemo(...)` helyett közvetlen hívás. Elvárás: az AC1 teszt bukik. Eredmény ide, a „Mért eredmények” alá.

## T4 — Mérőszkript

Fájl: `source/scripts/perf/measure-game-frames.mjs` — a diagnózis `measure.mjs`-e, változtatással: a `playwright` a szkript saját
`source/package.json`-jából töltődik (`createRequire(new URL("../../package.json", import.meta.url))`), a kimeneti mappa kötelező `--out`,
a nem-Kockavadász játékok indítógombja: `tsunami-english` → `button-tsunami-start`, `word-ladder-hu-en` → `wl-start`, `brain-rot-steal` →
szerep szerinti gomb `/indít|indul|start|vadász|rajta/i`. A szkript az éles websuli.vip oldalt nyitja; `--local <dist/public>` esetén a HTML és az
`/assets` a helyi buildből jön, az `/api` olvasó GET-jei az élesből.

## T5 — Mérés ELŐTTE / UTÁNA (AC6)

1. ELŐTTE build: `origin/main` munkafa (`.claude/worktrees/kockavadasz-diag`, ha a fej `origin/main`; különben friss `git worktree add --detach`)
   `npm.cmd --prefix source run build`; UTÁNA: ez az ág, ugyanígy.
2. Futtatás mindkét buildre, fejes Chrome, LÁTHATÓ ablak:
   `node source/scripts/perf/measure-game-frames.mjs --gpu real --view fold --cpu 1 --rep 1 --local <dist/public> --label <before|after> --out <scratchpad>`
   és `--view phone`; Kockavadász `--hold` nélkül és `--hold`-dal (tartásos bányászás); 4× CPU: `--cpu 4` a kihajtott nézeten.
3. Füstmérés: `--game tsunami-english`, `--game word-ladder-hu-en`, `--game brain-rot-steal`, `--view phone`, ELŐTTE / UTÁNA.
4. Tábla: fps medián, képkocka p95 / p99, hosszú feladat ms/s, E → kvíz, bányászás közbeni fps, vászon-Mpx, JS-heap.

## T6 — Kapuk

`npm run gate:stage` minden szakasz után; push előtt `npm run gate:push`; PR előtt: jelzés az orkesztrátornak a fej-hash-sel (független ellenőr),
utána `npm run gate:pr -- --body-file <leírás.md>`.

## Mért eredmények

### Teszt (T2)

`node --import tsx --test tests/material-quizzes-hook-memo.test.ts` → 4/4 `ok` (AC4 347 ms, AC1 101 ms, AC2 102 ms, AC3 16 ms).
A `npm run gate:stage` ZÖLD (tsc, tesztek tsc-je, ESLint, repó-szabályok, 1 célzott + 23 őr-teszt).

### Mutációs ellenpróba (T3, a `b8dc8022` commit után)

A `useMemo` helyett közvetlen hívás + renderenkénti `[]` az üres ágakon (a régi viselkedés) → **AC1 ✖, AC3 ✖**, AC2 ✔, AC4 ✔
(a tartalom nem változik, csak a referencia). Visszaállítás: `git checkout -- source/client/src/hooks/useMaterialQuizzes.ts` (commitolt
állapot), `git status` tiszta.

### Böngészős mérés (T5)

Módszer: `source/scripts/perf/measure-game-frames.mjs` (= a diagnózis `measure.mjs`-e, útvonal-függetlenítve), fejes Chrome, látható
ablak, valódi GPU (AMD Radeon 890M, ANGLE D3D11), ELŐTTE = `26bae97f` (`origin/main`) build, UTÁNA = `b8dc8022` build, mindkettő
`--local <dist/public>`, az `/api` élesből (kérdésbank: 25 144 tétel, 10,4 M kar.). Nyers JSON: `scratchpad/kockavadasz-perf/runs/`.
„átl. fps” = képkockák / idő (nem medián); „HF” = 50 ms feletti főszál-feladatok összideje / s.

**Kockavadász, kihajtott nézet 827×896, dpr 2,625, 1× CPU (n = 3, ebből 1 tartásos bányászással)**

| állapot | ELŐTTE átl. fps | ELŐTTE p95 | ELŐTTE HF ms/s | UTÁNA átl. fps | UTÁNA p95 | UTÁNA HF ms/s |
|---|---|---|---|---|---|---|
| tétlen | 14,6 | 989 ms | 776 | **57,9** | 17 ms | **0** |
| bányászás (E → kvíz) | 11,1 | 1083 ms | 816 | **59,2** | 17 ms | **4** |
| bányászás után | 12,8 | 1108 ms | 801 | **56,8** | 22 ms | **35** |
| séta | 1,9 | 1261 ms | 993 | **56,1** | 22 ms | **28** |
| körbenézés (érintés) | 1,7 | 2389 ms | 991 | **58,8** | 17 ms | **8** |
| válasz (kvíz) | 3,2 | 967 ms | 963 | 50,2 | 162 ms | 121 |

E → kvíz (tartás nélküli bányászás): ELŐTTE 247–4647 ms (medián ~2,4 s), UTÁNA **28–84 ms** (5/5 megnyílt kísérlet; a tartásos futás
2,5 s-os értéke a 2,5 s-os tartás maga). JS-heap a futás végén: ELŐTTE 106 MB → UTÁNA 30 MB. Rajzolási hívás ~26–29, háromszög ~79 700
(változatlan — a megjelenítés nem változott). Vászon 1240×1252 = 1,55 Mpx.

**Kockavadász, 390×844, dpr 3, 1× CPU (n = 2):** séta 1,7 → **58,3** fps (HF 991 → 13 ms/s); körbenézés 2,0 → 50,8 (985 → 83);
tétlen 1,3 → 56,1 (991 → 12); E → kvíz 3401–3649 ms → **24–340 ms**.
**Kockavadász, kihajtva, 4× CPU (n = 1, UTÁNA):** séta / körbenézés 58,8 fps, HF 0; tétlen 49,6 (76 ms/s); bányászás 23,0 fps (390 ms/s —
a kvíz megnyitásának renderje 4×-esen); E → kvíz 217–317 ms.

**Szökőár, kihajtott nézet 827×896, dpr 2,625, 1× CPU (n = 2)**

| állapot | ELŐTTE átl. fps | ELŐTTE HF ms/s | UTÁNA átl. fps | UTÁNA p95 | UTÁNA HF ms/s |
|---|---|---|---|---|---|
| tétlen | 1,1 | 995 | **58,5** | 17 ms | **6** |
| futás | 1,1 | 993 | **56,6** | 25 ms | **21** |
| tétlen 2 | 0,9 | 996 | **57,6** | 25 ms | **7** |

Szökőár 390×844 (n = 1): futás 1,5 → 59,7 fps (HF 994 → 0).
**Füstmérés 390×844 (n = 1):** Brain Rot futás 52,8 → 60,0 fps (HF 9 → 0); Szólétra futás 59,3 → 59,3, tétlen 48,2 → 53,9 (HF 144 → 82)
— egyik sem romlott.

### AC6 értékelés

- Teljesül (kihajtva, 1×): Kockavadász és Szökőár játék közben 56–59 átl. fps (≥ 50), HF 0–35 ms/s (< 100), E → kvíz 28–84 ms (< 200).
- **Maradék (NEM ebben a PR-ban, a lapok nem érinthetők):** (1) a kérdésbank megérkezésekor / az indításkor EGYSZERI ~0,9–1,2 s-os
  főszál-blokk (1× CPU; a lap `bank`-memója ekkor szűri át egyszer a 25 144 tételt az `isPlayableQuestion`-nel —
  `BlockCraftQuiz.tsx:1375-1376`, ill. a Szökőár `mergedPools`-a): a „startClick” fázis HF-je UTÁNA is 784 / 937 ms/s; ha a bank a kvíz
  alatt érkezik, az első válasz-kattintás 1,2 s-os LoAF (ez adja a „válasz” sor 121 ms/s-át). (2) 4× CPU-n a kvíz megnyitása / válasz
  renderje 250–390 ms/s. Mindkettő orkesztrátor-kérés a lapokra / a végpontra (kanban #72).
