# Spec: a `useMaterialQuizzes` hook referencia-stabil kimenete (Kockavadász-akadás gyökéroka)

> Dátum: 2026-11-17 · Szerző: Claude (kanban #90, orkesztrátori döntés „A” opció) · Állapot: JÓVÁHAGYVA (orkesztrátor, 2026-11-17)
> Végrehajtás: `docs/specs/2026-11-17-kerdesbank-hook-memo-vegrehajtas.md`

## 1. Cél

A tulajdonos szerint (2026-11-17) a Kockavadász telefonon, kihajtott hajlítható kijelzőn „LAGGOL, de nagyon”. A mért gyökérok: a közös
`useMaterialQuizzes` hook minden rendernél ÚJ `items` tömböt ad vissza, ezért a játéklapok erre épülő `useMemo`-i (Kockavadász: a teljes,
25 144 tételes kérdésbank újraszűrése az `isPlayableQuestion`-nel) minden rendernél újrafutnak. A javítás után a hook kimenete
(`items`, `rawItems`, `materials`) referenciában stabil, amíg a lekérdezés adata és a `topicFilter` nem változik — így a lapok memói csak
adatváltáskor futnak.

## 2. NEM cél

- A négy játéklap (`BlockCraftQuiz.tsx`, `BrainRotSteal.tsx`, `TsunamiEscapeEnglish.tsx`, `WordLadderHuEn.tsx`) módosítása — a #483 / #484 /
  #485 / #486 nyitott PR-ok írják őket. A javítás a hookban áll meg.
- A szerver-végpontok (`/api/games/material-quizzes`, `/api/games/quiz-bank/:gameId`) válaszmérete (kanban #72, külön jelentés).
- A szűrés tartalmi változtatása (`isPlayableQuestion`, `uniqueQuizContent`, `topicFilter` szabálya, sorrend) — bájtra ugyanaz marad.
- A 3D-megjelenítés (külön megbízás, `perf/kockavadasz-megjelenites` ág).

## 3. Érintett területek

- `source/client/src/hooks/useMaterialQuizzes.ts` (egyetlen kódfájl).
- Új teszt: `source/tests/material-quizzes-hook-memo.test.ts`.
- Mérőszkript (megismételhető ELŐTTE / UTÁNA mérés): `source/scripts/perf/measure-game-frames.mjs` (nem fut a CI-ban).
- Ez a spec és a végrehajtási fájl.

## 4. Mért alapvonal (a diagnózis-alügynök mérése, 2026-11-17)

Forrás: `scratchpad/kockavadasz-diag/reszeredmenyek.md` és `runs/*.json` (Playwright + CDP, fejes Chrome, valódi GPU, CPU-lassítás nélkül,
az éles websuli.vip oldalon).

- CPU-profil (telefonnézet 390×844, dpr 3): 157,7 s mintaidőből 137,7 s (87 %) a Kockavadász `bank` `useMemo`-jában
  (`BlockCraftQuiz.tsx:1356` a mainen) → `isPlayableQuestion` → `singleChoiceProblems`; a three.js-renderhurok 0,97 s (0,6 %).
- Kihajtott nézet (827×896 CSS, dpr 2,625), éles kérdésbankkal → üres kérdésbankkal (ellenpróba): séta 3,6 → 59,9 fps; képkocka p95
  625 → 17 ms; hosszú feladat 990 → 0 ms/s; bányászás 4,1 → 59,8 fps; E → kvíz 1754 ± 391 ms → 36 ± 8 ms; JS-heap 60 s után 135 → 18 MB.
- Renderkiváltók: az 1 s-os játékóra (`setRunSeconds` / `setTimeLeft`), a bányászás, a HUD-üzenetek.

## 5. Rögzített döntések és kényszerek

- `useMemo` a hookban, függőség: `q.data` (a TanStack Query szerkezeti megosztása miatt adatváltozás nélkül azonos referencia) és
  `topicFilter`.
- Az üres / betöltés alatti esetben modul-szintű, fagyasztott állandó tömb (`EMPTY_ITEMS`, `EMPTY_MATERIALS`), nem renderenkénti új `[]`.
- A szűrés tiszta függvénybe kerül (`selectPlayableMaterialItems`), változatlan tartalommal; a hook csak memoizál.
- A visszaadott objektum alakja (`grade`, `materials`, `items`, `rawItems`, `isLoading`, `isError`) és típusa nem változik.

## 6. Edge case-ek

- `q.data` undefined (betöltés / letiltott lekérdezés, `grade == null` és nincs `lessonId`): `items`, `rawItems`, `materials` stabil, üres.
- Üres `items` tömb a válaszban: stabil üres eredmény.
- `topicFilter` váltás azonos adatnál: új, helyesen szűrt tömb; visszaváltás után ismét helyes.
- Új adat (újralekérés más tartalommal / évfolyam-váltás): új tömb, helyes tartalom.
- Kis- és nagybetűs `topic` (`"English"`) és hiányzó `topic`: a régi szabály szerint (`toLowerCase`, hiány = "").
- Hívó mutációja: a hívók csak `filter` / `map`-et használnak (ellenőrizve: a négy lap hívási helyei); a fagyasztott üres tömb mutációja hibát dob — ez szándékos.

## 7. Elfogadási kritériumok (EARS)

- AC1: WHEN a hookot hordozó komponens N-szer (≥ 5) újrarenderel változatlan lekérdezés-adattal és `topicFilter`-rel THEN the system SHALL minden
  renderben ugyanazt az `items`, `rawItems` és `materials` referenciát adni, AND a szűrés (`isPlayableQuestion`) hívásszáma az első számítás után
  SHALL NOT nőni.
- AC2: WHEN a lekérdezés adata vagy a `topicFilter` megváltozik THEN the system SHALL új `items` tömböt adni, amelynek tartalma a régi
  számítással (`uniqueQuizContent(items.filter(isPlayableQuestion))`, majd a topic-szűrő) azonos.
- AC3: WHEN a lekérdezés még nem adott adatot (betöltés / letiltva) THEN the system SHALL renderek között azonos (üres) `items`, `rawItems` és
  `materials` referenciát adni.
- AC4: WHEN a bemenet nagy, vegyes minta (játszható és nem játszható tételek, ismétlődő tartalom, vegyes topic) THEN the system SHALL bájtra
  azonos eredményt adni a régi számítással (ugyanaz a sorrend és szűrés), minden `topicFilter`-értékre.
- AC5: WHEN a memoizálást kivesszük (mutációs ellenpróba) THEN az AC1 / AC3 teszt SHALL bukni.
- AC6: WHEN a Kockavadászt a kihajtott nézeten (827×896, dpr 2,625) és 390×844-en, valódi GPU-val, buildelt klienssel mérjük THEN séta,
  körbenézés és bányászás közben a képkocka p95 SHALL ≤ 20 ms, a hosszú feladatok összideje SHALL ≤ 50 ms/s, az E → kvíz idő SHALL ≤ 200 ms
  (ELŐTTE / UTÁNA tábla ugyanazzal a szkripttel). A másik három játék füstmérése SHALL NOT romlani (p95 és hosszú feladat).

## 8. Tesztterv

- `source/tests/material-quizzes-hook-memo.test.ts` (node:test + tsx, a repo `npm test` útja):
  - AC4: tiszta függvény (`selectPlayableMaterialItems`) vs. a régi képlet, nagy determinisztikus vegyes mintán, minden `topicFilter`-re.
  - AC1 / AC2 / AC3: a valódi hook egy próbakomponensben, `react-dom/client` + `act` alatt (jsdom, amely a projekt függőségi fájában már
    jelen van: `isomorphic-dompurify` → `jsdom`), `QueryClient` előre töltött adattal (hálózat nélkül), az `isPlayableQuestion` hívásszámát a
    tiszta függvény injektálható szűrőjén át számolva.
- AC5: mutációs ellenpróba commit után (a `useMemo` eltávolítása egy ideiglenes másolaton), az eredmény a végrehajtási fájlba.
- AC6: `source/scripts/perf/measure-game-frames.mjs` (a diagnózis szkriptjéből, útvonal-függetlenítve), ELŐTTE = `origin/main` build, UTÁNA = ez az ág.

## 9. Kockázatok / visszavonási terv

- Kockázat: egy hívó a visszaadott tömböt helyben módosítja (eddig minden render új tömböt kapott, ez elrejtette volna). Ellenőrizve: nincs ilyen
  hívás. Visszavonás: a commit revertje (egy fájl).
- A jsdom tranzitív függőség; ha egyszer kikerül a fából, a hook-teszt importja bukik (látható hiba, nem csendes).

## 10. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-17-kerdesbank-hook-memo-vegrehajtas.md`

<!-- acceptance-checklist -->
- [ ] AC1 referencia-stabil újrarendereléskor, a szűrő nem fut újra
- [ ] AC2 adat- / topicFilter-váltáskor új, helyes eredmény
- [ ] AC3 betöltés alatt stabil üres referencia
- [ ] AC4 bájtra azonos a régi számítással
- [ ] AC5 mutációs ellenpróba: memo nélkül bukik
- [ ] AC6 böngészős ELŐTTE / UTÁNA mérés a célszámokkal
