# Játékélmény + tananyaglogika — javítási terv (2026-09-08)

**Státusz:** végrehajtva (2026-09-08) — A1–A5, B1–B7, C1–C2, D1–D2 kész; mastery onRetry a Viharvadász/Aszteroida dokumentált modellje szerint kivétel marad
**Ág:** `main` (viewport + javítások merge után)
**Készült:** valós mérésekből (böngésző + futtatott ellenőrzések) és forrásból igazolt kódolvasásból
**Célközönség:** AI-ügynök, amely a feladatokat egyenként, sorrendben végrehajtja

Minden feladat önállóan végrehajtható. A séma minden feladatnál azonos:
**Bizonyíték → Cél → Kódmódosítás → Teszt előbb → Verifikáció → Nem-cél.**

---

## 0. Ma futtatott ellenőrzések (bizonyíték, nem feltételezés)

| Ellenőrzés | Parancs / mérés | Eredmény |
|---|---|---|
| Teljes verify | `npm run verify` (tsc + eslint + tsc-test + 937 node:test + build) | **PASS** — `tests 937 / pass 937 / fail 0`, build 9,16 s |
| Playwright E2E | `npx playwright test` (saját prod szerver az 5000-en) | **PASS** — `expected 63, unexpected 0, flaky 0`, 38,5 s |
| 1366×768 desktop, mind a 7 játék, menü + játék | CDP mérés: `scrollHeight-clientHeight`, gombdobozok | **Nincs oldalgörgetés játék közben** egyik játéknál sem |
| Valódi győzelmi út (Szólétra) | 16/16 fok végigjátszva scripttel, 43 mp | **Győzelmi képernyő OK** — 1366×768 és 390×844: `sy=0`, „Újra”/„Lista” gomb 44 px, látható |
| Szint-/zónaváltás (Szólétra) | ugyanaz a futam | Rét → Felhők → Csillagok váltás renderelt, nincs törés |
| 0-életes szabály (Matek sprint) | 3 rossz válasz élesben | **Igazolt:** 1–2. kártyán „Újrapróbálom”, a 3.-on (0 élet) **csak** „Értem, megyek tovább”; magyarázat mindháromnál megvan |
| Lecke élesben (8. o. sokszögek) | `/preview/3b772f87-…`, 390×844 és 1366×768 | Nincs vízszintes túlcsordulás; opciónkénti tévhit-visszajelzés működik; helyes válasz után lezár |

**Ma sem futott (nyílt kockázat):** deploy; győzelmi/szintlezárási út a másik 6 játékban (Matek sprint 18 helyes, Szökőár 8, Brain Rot 7 sorozat, BlockCraft pálya 1/5, Aszteroida 12 hullám, Viharvadász szint 1/200) — ezekhez determinisztikus teszt-kapcsoló kell, lásd **D1**.

---

## 1. Prioritási sorrend

1. **A1** (Szólétra: a magyarázat alatt továbbfut a játék) — tanulást ront, mérve
2. **B1** (lecke haladásjelző beragad 1/6-on) — minden leckét érint, mérve
3. **B2** (üres `try.spec` → minden válasz „Helyes!”) — hamis sikerélmény
4. **C1** (Viharvadász szintlista az egész oldalt görgeti) — a felhasználó által jelzett tünet oka
5. **B6** (újrapublikálás árva `html_files` sort hagy) — adat/link-integritás
6. **A2** (egységes retry/XP-szabály) — döntést igényel, utána mechanikus
7. A többi a súlyosság szerint

---

## BLOKK A — Játékok tanulási logikája

### A1 — KRITIKUS: Szólétra tovább lépteti a kérdést a nyitott magyarázó kártya alatt

**Bizonyíték (mért, 2026-09-08, 390×844):** rossz válasz után a modal kártya végig nyitva marad, de a mögötte lévő kérdés **1,8 s-nál kicserélődik**:

```
t=1500 ms  card=true  prompt="Mit jelent: What's the mat…"
t=1800 ms  card=true  prompt="„Szeptember” angolul:"      ← csere nyitott kártya alatt
```

Kód: `source/client/src/pages/WordLadderHuEn.tsx:492` (kártya megnyitása) és `:533-559`
(`stepTimerRef` → `REVEAL_MS` 900 ms → beágyazott `setTimeout(…, STEP_MS)` → `setCurrent(nextQuestion)`).
A `runSeconds` óra is ketyeg olvasás közben.

**Cél (EARS):** AMIKOR a tanuló rossz választ ad és megnyílik a magyarázó kártya, A RENDSZER NEM lépteti a létrát és NEM cseréli a kérdést, AMÍG a kártyát be nem zárja; a futamidő-számláló szünetel.

**Kódmódosítás:** `WordLadderHuEn.tsx`
1. Az `onAnswer` hibás ágán ne induljon el a lépés-lánc: a `stepTimerRef` időzítőket csak akkor indítsd, ha `isCorrect === true`, VAGY ha a kártya már be van zárva.
2. Emeld ki a lépés-láncot egy `runStepChain(target, nextCursor, nextQuestion, isCorrect)` függvénybe, és tárold el pending-ként (`pendingStepRef`), ha `explainCard !== null`.
3. A kártya `onDismiss` handlerében: `setExplainCard(null); pendingStepRef.current?.(); pendingStepRef.current = null;`
4. A futamidő-számláló (`runSeconds` intervallum) `explainCard !== null` alatt ne növekedjen.
5. Unmountkor `pendingStepRef.current = null` a meglévő `timeoutsRef` takarítás mellett.

**Teszt előbb:**
- E2E: `source/tests/game-viewport-experience.spec.ts` mellé új blokk vagy új fájl
  `source/tests/game-explanation-pause.spec.ts`:
  „Szólétra: a magyarázó kártya alatt a kérdés NEM változik” — indítás, rossz válasz,
  `prompt` szöveg rögzítése, 3 s várakozás, `expect(prompt).toBe(sameText)`, majd a kártya bezárása
  után `expect(prompt).not.toBe(sameText)`.
- Unit/wiring: `source/tests/game-feedback-wiring-guard.test.ts` — a `WordLadderHuEn.tsx` forrása
  tartalmazzon `pendingStepRef` bekötést az `onDismiss`-ben (statikus guard, hogy vissza ne essen).

**Verifikáció:** `npx playwright test tests/game-explanation-pause.spec.ts` és `npm test`

**Nem-cél:** a REVEAL/STEP animációk időzítésének átszabása helyes válasz esetén.

---

### A2 — DÖNTÉS + KÖZEPES: egységes retry- és XP-szabály mind a 7 játékban

**Bizonyíték:** csak a Matek sprint ad „Újrapróbálom” gombot; a
`source/client/src/game-engine/QuizFeedbackCard.tsx:76` (`showRetry = card.retryable && typeof onRetry === "function"`)
csak `onRetry` átadásakor rajzolja ki, és a 6 másik hívási hely nem ad `onRetry`-t
(`WordLadderHuEn.tsx:911`, `BlockCraftQuiz.tsx:2478`, `TsunamiEscapeEnglish.tsx:1729`,
`BrainRotSteal.tsx:1210`, `SpaceAsteroidQuiz.tsx:2500`, `TornadoHunter200.tsx:1772`).
A jelenlegi eltérések **részben szándékosak** és kommentben dokumentáltak:
- Brain Rot: `BrainRotSteal.tsx:386-389` — „a gyerek ugyanazt a lényt kapja el újra” → implicit, ingyenes újrapróba, **teljes XP-vel**.
- Aszteroida: `SpaceAsteroidQuiz.tsx:2450-2451` — a UI kiírja: „Rossz válasz → új kérdés”.
- Viharvadász: `TornadoHunter200.tsx:1441` — `attempt: 1` szándékosan tiltja a retryt vezetés közben.

**Cél:** egyetlen, kimondott szabály a repóban, és a 7 játék ehhez igazítva. Javasolt szabály
(a Matek sprint mai viselkedése az etalon):
1. Rossz válasz + `remainingLives > 0` + `attempt === 0` → jár az „Újrapróbálom”.
2. `remainingLives === 0` → nincs retry (ez már él, mérve).
3. Második próbára adott helyes válasz **csökkentett** pontot ad: alappont igen, gyorsasági és kombó-bónusz nem, a kombó nem nő.
4. Ahol nincs élet-fogalom (Aszteroida kvíz, Brain Rot), ott a „szabad újrapróba” marad, de a **második próba XP-je csökkentett**, és a UI ezt kiírja.

**Kódmódosítás:**
1. Új modul: `source/client/src/game-engine/retry-policy.ts`
   ```ts
   export const RETRY_XP_FACTOR = 0.5;
   export function canRetry(input: { attempt: number; remainingLives?: number }): boolean;
   export function xpForAttempt(baseXp: number, attempt: number): number;
   ```
2. Minden játék `onAnswer` ágán `attempt` számláló bevezetése kérdésenként (`attemptRef`).
3. XP-számításnál `xpForAttempt(...)` használata. A Matek sprintben az `attemptRef` **már létezik**
   (`SpeedQuizMath.tsx:297`, `:400`) és el is jut a kártyáig (`:370`), de a pontszámítás nem használja:
   `:525-528` (`base + speedBonus + comboBonus`) a második próbára is teljes pontot ad.
4. `SpeedQuizMath.tsx:501` — a `setAnswered((n) => n + 1)` minden válaszra fut, így a retry ugyanazt a
   feladatot másodszor is beszámolja a statisztikába (és az achievement-számításba).

**Teszt előbb:** `source/tests/game-retry-policy.test.ts` — `canRetry`/`xpForAttempt` táblázatos esetei
(0 élet, 1. próba, 2. próba), plusz bővítés a `game-feedback-wiring-guard.test.ts`-ben:
minden játékfájl vagy `onRetry`-t ad, vagy szerepel egy dokumentált kivétel-listán.

**Verifikáció:** `npm test`

**Nem-cél:** a nehézségi (adaptív) rendszerek egységesítése — az külön feladat (**A7**).

---

### A3 — KÖZEPES: BlockCraft — a magyar tananyag-kérdések angol pool-ba kerülnek

**Bizonyíték:** `source/client/src/pages/BlockCraftQuiz.tsx:1220-1225`
```ts
: t === "english" ? "english"
: "english"; // hungarian topic alapú kérdéseket "english" csoportba tesszük
```
A körkörös tantárgy-váltás (`:1313-1314`) így magyar kérdést ad angol körben.

**Cél:** a `hungarian` topic saját pool-t kap; a körforgás tartalmazza.

**Kódmódosítás:** `QuizSubject` bővítése `"hungarian"`-nal (`:41`), mapping javítása,
a körkörös lista és a UI-címkék kiegészítése; ismeretlen topic → `"english"` marad (fallback).

**Teszt előbb:** `source/tests/blockcraft-subject-mapping.test.ts` — a `topic → subject` leképezés
tiszta függvényként kiemelve, esetek: `math`, `nature`, `english`, `hungarian`, `""`, `undefined`.

**Verifikáció:** `npm test`

---

### A4 — KISEBB: hibás `correctIndex` esetén a gyerek csak elutasítást kap

**Bizonyíték:** `source/client/src/game-engine/feedback.ts:104-108` — ha a `correctIndex` az opciókon
kívülre mutat, a kártya szövege: „Ezt a kérdést most nem tudjuk kiértékelni — lépj tovább”.

**Cél:** ilyen tétel **ne is jusson el a gyerekig**: a bank-egyesítéskor szűrjük ki, és jelezzük a naplóban.

**Kódmódosítás:** `source/client/src/lib/mergeGameQuizBank.ts` (a merge belépési pontja) —
`correctIndex` tartomány-ellenőrzés, hibás tétel kiejtése + `logger.warn`. A `feedback.ts` fallback
maradjon utolsó védvonalnak.

**Teszt előbb:** kiegészítés a meglévő `source/tests/quiz-bank-integrity.test.ts`-hez:
hibás `correctIndex`-ű tétel a merge után ne szerepeljen az eredményben.

**Verifikáció:** `npm test`

---

### A5 — KISEBB: 44 px-es célterület a kvíz-válaszgombokon + `reducedMotion`

**Bizonyíték:** `SpaceAsteroidQuiz.tsx:2454-2465` és a Brain Rot kvízgombjai `h-auto py-3` mintát
használnak `min-h-[44px]` nélkül (a `QuizFeedbackCard.tsx:130` gombjai már 44 px-esek).
`SpeedQuizMath.tsx`-ben nincs `useReducedMotion` (a `WordLadderHuEn.tsx:294` van).

**Kódmódosítás:** `min-h-[44px]` a kvíz-válaszgombokra; `SpeedQuizMath`-ban a villanó/rázó
effektek `prefers-reduced-motion` mellett kimaradnak.

**Teszt előbb:** a meglévő `source/tests/games-touch-controls.spec.ts` mintájára új assert-blokk:
minden játék kvíz-válaszgombja `height >= 44` 390×844-en.

**Verifikáció:** `npx playwright test tests/games-touch-controls.spec.ts`

---

## BLOKK B — Tananyag (lecke) logika

### B1 — KRITIKUS: a lecke haladásjelzője soha nem lép

**Bizonyíték:** `source/client/src/lesson-runtime/LessonRuntime.tsx:376`
```tsx
<LessonProgress sections={lesson.sections} band={band} current={0} />
```
Böngészős mérés (390×844, 6 szakaszos lecke): 9897 px görgetési út, a sticky sáv felül ragad
(`top: 0`), de a szövege végig **„1 / 6 szakasz”**; minden pötty `todo` marad.

**Cél (EARS):** AMIKOR a tanuló elér egy szakaszt (vagy beküldi a szakasz Próbáját),
A RENDSZER a haladássávot az aktuális szakaszra állítja.

**Kódmódosítás:** `LessonRuntime.tsx`
1. `const [current, setCurrent] = useState(0)`.
2. `IntersectionObserver` a `[data-testid^="lesson-section-"]` elemekre (`rootMargin: "-45% 0px -45% 0px"`),
   a látható szakasz indexe → `setCurrent`.
3. Sikeres Próba-beküldés a szakaszban → `setCurrent(Math.max(current, sectionIdx + 1))`.
4. `LessonProgress` `current={current}`; a lépéspöttyök kattinthatók maradnak (`data-progress-step`).
5. `prefers-reduced-motion` mellett is működjön (nem animáció, csak állapot).

**Teszt előbb:** `source/tests/lesson-progress.spec.ts` (Playwright):
egy publikált többszakaszos leckén görgetés a 3. szakaszhoz →
`expect(page.getByTestId("lesson-progress")).toContainText("3 / ")`.

**Verifikáció:** `npx playwright test tests/lesson-progress.spec.ts`

**Nem-cél:** szerveroldali haladásmentés (az **B5**).

---

### B2 — KÖZEPES: hiányzó `try.spec` mellett minden válasz „Helyes!”

**Bizonyíték:**
- `source/client/src/lesson-runtime/blocks/try-blocks.tsx:40`
  `const isCorrect = checked && (correct.length === 0 ? true : …)` — üres `correctOrder` → bármi helyes.
- ugyanott `:88` — `answers.every(...)` üres `answers` tömbre `true` → üres kitöltés is „Helyes!”.
- A séma ezt átengedi: `source/shared/lesson-schema.ts:108` — a `try.spec` `z.record(z.unknown())`,
  vagyis a kapu semmilyen szerkezeti hibát nem fog el a gyakorlat-specekben.

**Cél:** hibás vagy hiányos gyakorlat-spec ne adjon hamis sikerélményt, és a **kapu** fogja el a szerzőnél.

**Kódmódosítás:**
1. `lesson-schema.ts`: `try.spec` diszkriminált unió `kind` szerint —
   `dragSort`: `items: string[] (min 2)`, `correctOrder: string[] (nem üres, items permutációja)`;
   `fillBlank`: `text` `___` helyőrzőinek száma **egyezik** az `answers` hosszával;
   `pairs`: bal/jobb lista azonos hosszú, nem üres. `superRefine`-nal, magyar hibaüzenettel.
2. `try-blocks.tsx`: üres/érvénytelen spec esetén ne „Helyes!”-t írjon, hanem a meglévő
   „Ehhez a gyakorlathoz nincs megadott elem.” mintájú, ellenőrzést letiltó állapotot.

**Teszt előbb:** kiegészítés `source/tests/lesson-schema.test.ts`-hez (érvénytelen specek elbuknak)
és új `source/tests/try-blocks-guard.test.ts` (üres `correctOrder`/`answers` → nincs „Helyes!”).

**Verifikáció:** `npm test`

**Figyelem:** a séma szigorítása **meglévő leckéket is elbuktathat**. A feladat része egy
migrációs számbavétel: `select count(*) from lessons` alapján riport, hány mentett lecke bukna el;
ha van ilyen, előbb adat-javító szkript, csak utána a kapu szigorítása.

---

### B3 — KÖZEPES: a gyakorló feladatok hibás válasza nem tanít

**Bizonyíték:** `try-blocks.tsx:67-68` („Még nem jó — próbáld újra!”) és `:112-113`
(„Nem stimmel minden — nézd át újra!”) — generikus szöveg. Ezzel szemben a `check` blokk
opciónkénti magyarázata kötelező, és élesben működik is (mért a 8. o. sokszögek leckén:
„A 12 nem a képlet eredménye. Először 6·3=18, majd 18/2=9.”).

**Cél:** a `try` blokk hibás válasza is adjon tartalmi támpontot.

**Kódmódosítás:** `try.spec`-be opcionális `hint` (és `perAnswerHint`), a `try-blocks.tsx`
hibaágon ezt jelenítse meg; ha nincs, a szakasz első `check`-jének fogalmára hivatkozzon
(„Nézd át újra: <fogalom>”). Etalon a `check` blokk: `source/shared/lesson-schema.ts:100`
(`feedbackPerOption` kötelező) + `:138-141` (a hossza egyezik az opciók számával).

**Teszt előbb:** `try-blocks-guard.test.ts` bővítés: `hint` jelen van → megjelenik a hibaüzenetben.

**Verifikáció:** `npm test`

---

### B4 — KÖZEPES: a Próba nyers fogalom-ID-kat mutat a gyereknek

**Bizonyíték:** `source/client/src/lesson-runtime/SectionProba.tsx:123-125`
```tsx
{result.weakConceptIds.map((id) => (<li key={id}>{id}</li>))}
```
A tanuló `C01`-szerű címkéket lát a „Nézd át ezeket” lista alatt.

**Cél:** emberi fogalomnév (`term`) jelenjen meg; ID csak fallback.

**Kódmódosítás:** a lecke `map`/fogalomtérkép `localId → term` feloldása a `SectionProba`
propjaiba (a `LessonRuntime` már ismeri a leckét); hiányzó `term` esetén az ID marad.

**Teszt előbb:** Playwright kiegészítés a meglévő `remaining-learning.spec.ts` mintájára:
bukott Próba után a lista NEM `/^C\d+$/` alakú elemeket tartalmaz.

**Verifikáció:** `npx playwright test`

---

### B5 — KÖZEPES: a `qualityNotes` minőségi jelzés sehol nem látszik

**Bizonyíték:** `qualityNotes` előfordulásai: `source/server/studio/step-runner.ts`,
`source/server/studio/pipeline.ts`, `source/server/studio/autonomous.ts` és két teszt —
**a `source/client/` alatt nulla találat**. A kör-limit utáni publikálás szándékos és tesztelt
(`source/tests/studio-gate-publish.test.ts`: „gate fail a kör-limit után → LS-7 (#189): PUBLIKÁL jelzéssel”),
de a „jelzés” ma senkinek nem jelenik meg.

**Cél:** az admin lássa a minőségi figyelmeztetést a leckénél; a tanulói nézet változatlan.

**Kódmódosítás:** a `studio_jobs.output.qualityNotes` átadása a lecke admin nézetének
(Studio panel eredménydoboz + a lecke listaeleme), sárga „Minőségi jelzés” sávban, tételes felsorolással.

**Teszt előbb:** `source/tests/studio-quality-notes-ui.test.ts` — a komponens forrása hivatkozzon
a `qualityNotes` mezőre (statikus wiring-guard), plusz Playwright, ha admin munkamenet elérhető a teszthez.

**Verifikáció:** `npm test`

---

### B6 — KÖZEPES: minden publikálás új `html_files` sort hoz létre (árva rekord + törhető link)

**Bizonyíték:** `source/server/studio/step-runner.ts:930-960` — a tranzakció mindig
`insert(htmlFiles)`, majd a `lessons.htmlFileId` az új sorra mutat. A régi `html_files` sor
megmarad, de már senki nem hivatkozik rá; a korábban kiosztott `/preview/<régi id>` link
elavult tartalomra mutat. A `docs/lesson-improvement.md` az azonosítók megőrzését írja elő.

**Cél:** újrapublikáláskor a meglévő `htmlFileId` maradjon; csak a metaadat frissüljön.

**Kódmódosítás:** `publishLesson` — ha `lessons.htmlFileId` már létezik: `update(htmlFiles)`
(cím, `classroom`, `contentType`) az `insert` helyett; új lecke esetén marad az `insert`.
A `gameQuizItems` idempotens törlés/beszúrás változatlan.

**Teszt előbb:** `source/tests/studio-publish-idempotent.test.ts` — kétszeri `publishLesson`
ugyanarra a `lessonId`-ra: a visszaadott `htmlFileId` **azonos**, és nem keletkezik új `html_files` sor.

**Verifikáció:** `npm test`

---

### B7 — KISEBB: a lecke-futtató semmit nem ment; frissítés = minden válasz elveszik

**Bizonyíték:** a `source/client/src/lesson-runtime/` alatt nincs `localStorage`/`sessionStorage`
találat, és a `LessonRuntime.tsx`-ben nincs mentő API-hívás; böngészős mérés: a lecke megnyitása és
kvíz-kitöltés után `Object.keys(localStorage)` lecke-kulcsot nem tartalmaz.

**Cél:** oldalfrissítés után a tanuló ott folytassa, ahol abbahagyta (válaszok, try-állapot, aktuális szakasz).

**Kódmódosítás:** `useLessonProgress(lessonId)` hook — `localStorage` kulcs
`websuli.lesson.<htmlFileId>.v1`, debounce-olt mentés, mountkor visszatöltés, verziómező a sémaváltáshoz.

**Teszt előbb:** `source/tests/lesson-progress-persistence.spec.ts` — kvíz megválaszolása,
`page.reload()`, a válasz állapota megmarad.

**Verifikáció:** `npx playwright test tests/lesson-progress-persistence.spec.ts`

---

## BLOKK C — Megjelenés (a hiányzó mérésekből)

### C1 — KÖZEPES: a Viharvadász „Szintek” képernyője az egész oldalt görgeti

**Bizonyíték (mért):** 1366×768-on a szintválasztó `scrollHeight-clientHeight = 367 px`,
a fejléc kigörög; 390×844-en a felhasználó által jelzett ~48 px. Ok: a `LevelsScreen`-ben
**van** belső görgetőterület (`TornadoHunter200.tsx:626`: `overflow-y-auto flex-1 min-h-0`),
de sosem aktiválódik, mert az egyképernyős CSS a `data-playing="true"`-hoz kötött
(`source/client/src/index.css:396-421`), a Viharvadásznál pedig `data-playing={screen === "play"}`
(`TornadoHunter200.tsx:202`) — a szintlista képernyőn tehát a shell magassága nincs korlátozva.

**Cél (EARS):** AMIKOR a tanuló a szintválasztón (vagy garázs/beállítás/eredmény képernyőn) van,
A RENDSZER a fejlécet és a vissza-gombot rögzítve tartja, és csak a lista görög belül;
az oldal (`document`) nem görög.

**Kódmódosítás:**
1. `index.css`: a `[data-playing="true"]` egyképernyős blokk mellé azonos szabálycsomag
   `[data-fixed-screen="true"]`-ra (vagy a szelektor bővítése:
   `.game-shell-fixed[data-playing="true"], .game-shell-fixed[data-fixed-screen="true"]`).
2. `TornadoHunter200.tsx:202`: `data-fixed-screen={screen !== "menu"}` (vagy a lista/garázs/statisztika képernyőkre).
3. Ellenőrizd, hogy a `[data-game-card-content]` `min-height: 0` öröklődik, különben a belső
   `overflow-y-auto` továbbra sem kap magasságot.

**Teszt előbb:** bővítés `source/tests/game-viewport-experience.spec.ts`-ben:
Viharvadász → „Vadászat indítása” → szintlista; 390×844 **és** 1366×768:
`document.scrollingElement.scrollHeight - clientHeight === 0`, a „Szintek (1–200)” fejléc
és az 1. szint gombja a viewportban.

**Verifikáció:** `npx playwright test tests/game-viewport-experience.spec.ts`

---

### C2 — KÖZEPES: érintőgombok egérrel is helyet foglalnak, a 3D vászon összemegy

**Bizonyíték (mért, 1366×768, egér-pointer):** BlockCraft vászon `1166×440`, Aszteroida `1166×455`
768 px magas ablakban; a D-pad in-flow, a vászon alatt van
(`BlockCraftQuiz.tsx:2365-2370` — a komment maga mondja: „mobil + fallback”).
Ellenpélda a helyes mintára: `TsunamiEscapeEnglish.tsx:785-786` `matchMedia("(hover: none)")` /
`("(pointer: coarse)")` alapján dönt; a Viharvadász `TouchControls`-a abszolút pozicionált overlay
(`TornadoHunter200.tsx:1963-1966`), ezért nem vesz el helyet.

**Cél:** egér/trackpad esetén a vászon kapja a helyet; érintőn változatlan a mai vezérlés.

**Kódmódosítás:** közös `useCoarsePointer()` hook (`source/client/src/hooks/`), a Tsunami mai
logikájából kiemelve; BlockCraft és Aszteroida a D-pad/akciógombokat vagy elrejti (finom pointer +
billentyű-súgó megjelenítése), vagy overlay-be teszi. `resize`/`matchMedia` változásra reagáljon.

**Teszt előbb:** `source/tests/games-pointer-controls.spec.ts` — `hasTouch: false` kontextusban a
vászon magassága a viewport ≥60%-a; `hasTouch: true` kontextusban a D-pad látható és ≥44 px.

**Verifikáció:** `npx playwright test tests/games-pointer-controls.spec.ts`

---

## BLOKK D — Bizonyíthatóság (ez zárja le a „nem futtattam” tételeket)

### D1 — Determinisztikus teszt-kapcsoló a győzelmi/szintlezárási utakhoz

**Miért:** ma egyik játék győzelmi útja sem futtatható E2E-ben, mert a kérdések véletlenszerűek és
a helyes válasz nincs kitéve a DOM-ba. A Szólétra győzelmét ma csak úgy tudtam végigvinni, hogy a
válaszokat a forrás bankjából olvastam ki — ez tesztként törékeny.

**Kódmódosítás:** a meglévő `VITE_ENABLE_RUNTIME_PROBE` mintáját követve
(`source/playwright.config.ts:46` — `build:e2e` már ilyen kapcsolóval épít):
`VITE_ENABLE_GAME_TEST_HOOKS=1` esetén
1. `?seed=<szám>` query a kérdéssorrend determinisztikussá tételére,
2. a kvíz-opció gombokra `data-correct="true|false"` attribútum,
3. `window.__websuliGame = { forceState }` a hullám/szint gyors lezárásához.
A kapcsoló nélkül ezek a kódutak **ne kerüljenek bele** a bundle-be (a próbaoldalnál már bizonyított minta).

**Teszt előbb:** `source/tests/game-win-paths.spec.ts` — mind a 7 játék: győzelem/szintlezárás
eléréséig vezetett futam, majd: nincs oldalgörgetés, a jutalomképernyő gombjai láthatók és 44 px-esek,
a végpontszám a helyes válaszok számával konzisztens.

**Verifikáció:** `npm run build:e2e && npx playwright test tests/game-win-paths.spec.ts`;
plusz guard-teszt, hogy az éles build nem tartalmazza a hook-okat (a próbaoldal mintájára).

---

### D2 — A viewport-suite kiterjesztése

**Ma:** `game-viewport-experience.spec.ts` a Matek sprintet, Szólétrát és BlockCraftot fedi.
**Cél:** mind a 7 játék × {390×844, 360×640, 844×390, 1366×768} × {menü, játék, vég/győzelem},
plusz a C1/C2 assertjei.

---

### D3 — A ma commitolatlan munka lezárása

`git status` szerint 14 módosított és 5 új fájl van a `codex/game-viewport-experience` ágon
(0-életes retry, egyképernyős CSS, menülayoutok, `MathTowerScene`, `CollectibleAvatar`,
`game-viewport-experience.spec.ts`). Ezek ma **zöld** verify és **zöld** 63/63 E2E mellett állnak.
Javasolt: atomi commitok (1. motor+teszt, 2. CSS+layout, 3. új komponensek, 4. E2E+spec-dok),
majd PR. Enélkül a fenti feladatok egy már amúgy is nagy diffre rakódnának.

---

## 3. Végrehajtási sorrend az ügynöknek

```
1. D3  (commitok — tiszta kiindulás)
2. A1  → teszt, javítás, playwright
3. B1  → teszt, javítás, playwright
4. C1  → teszt, javítás, playwright
5. B2  (+ migrációs számbavétel!) → npm test
6. B6  → npm test
7. A2  (döntés után) → npm test
8. B4, B3, B5, B7, A3, A4, A5, C2
9. D1, D2  (ezek zárják le a „nem futtattam” tételeket)
10. npm run verify && npx playwright test   (teljes kör, PR előtt)
```

Minden lépés végén: **futtatott parancs + valós kimenet** a jelentésbe; ami nem futott,
azt „NOT RUN + ok + kockázat” formában kell jelenteni.
