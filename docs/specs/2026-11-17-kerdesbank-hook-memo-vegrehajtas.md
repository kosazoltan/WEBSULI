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

(A végrehajtás során töltendő: teszt-kimenet, mutációs ellenpróba, mérőtábla.)
