# Feleletválasztós válaszok kevert megjelenítése

Tulajdonosi kérés 2026-11-02 (az Antigoné-lecke élő ellenőrzése után): a helyes válasz helye ne legyen kitalálható.

## Mért probléma (élő lecke `8eac8bc8…`, „Szophoklész: Antigoné”)
- Tananyag-ellenőrző kérdések: 7-ből 6-nál a „B” a helyes (`correctIndex` = 1).
- Kvíz: 98 kérdésből a helyes `correctIndex` megoszlása A:54, B:30, C:12, D:2.
- A lejátszó a tárolt sorrendben mutat (böngészőben ellenőrizve), a generátor torzítása így közvetlenül látszik.

## Cél
- A három feleletválasztós felület a válaszokat **kevert, kérdésenként determinisztikus** sorrendben mutatja:
  1. Tananyag-ellenőrző (`client/src/lesson-runtime/LessonRuntime.tsx` `CheckBlock`),
  2. Kvíz fül (`client/src/lesson-runtime/LessonExperienceView.tsx`),
  3. bejelentkezett gyakorlókör (`client/src/lesson-runtime/SavedLessonQuiz.tsx`).
- A betűjel (A–D) a **megjelenített pozíciót** követi.

## Nem-cél
- A tárolt lecke, a `correctIndex`, a bank, a szerveroldali pontozás és a generátor változatlan.
- A régi HTML-anyagok kvíze (`HtmlLessonQuiz`), a játékok, a `CognitiveMethods` (más mechanika).

## Rögzített döntések
- Új tiszta modul: `shared/option-order.ts`, `optionOrder(seed: string, count: number): number[]`
  — FNV-1a 32 bites hash a seedből → mulberry32 PRNG → Fisher–Yates. Visszaadja az eredeti indexek megjelenítési sorrendjét.
- Seed: Tananyag/Kvíz: `question + "\u0000" + options.join("\u0000")`; gyakorlókör: a kör kérdésének `id`-je.
  Determinisztikus: újratöltés, mentett válasz visszaállítása és ugyanaz a kérdés mindig ugyanabban a sorrendben jelenik meg.
- **Az indexek eredetiek maradnak**: kattintáskor az eredeti index megy a `onPick` / `picks` / `POST …/answer` felé, így a mentett
  állapot, a szerveroldali pontozás (`server/rewards/grade.ts`, `lesson-attempts.ts`) és a `feedbackPerOption` változatlanul érvényes.
- A `data-testid="check-option-{i}"` az **eredeti** indexet hordozza (stabil tesztcél).
- **Leckén / körön belül kiegyensúlyozott elhelyezés** (`balancedLayouts(choices)`): a puszta kérdésenkénti keverés mérten
  determinisztikus mintát adhat (az Antigoné 7 ellenőrzőjéből 6-nál „A” lett volna, mindig). Ezért a helyes válasz célpozícióját a
  kérdések sorában a legkevésbé használt pozíciók közül választja (seedelt döntetlen-bontással), a többi opció kevert sorrendben.
  Tananyag: az összes `check` blokk egy elrendezés (React-kontextus a `LessonRuntime`-ból); Kvíz: a kör kérdései.
- A bejelentkezett gyakorlókörnél a kliens nem kapja meg a `correctIndex`-et (`lesson-attempts.ts` `viewOf` kivágja), ott kérdésenkénti
  keverés marad (`displayOrder(q.id, …)`) — korlát, kiegyensúlyozás nélkül. Review #375 (P2): a szerver (`viewOf`) kérdésenként
  `fixedOrder` jelzőt küld (`refersToOtherOptions(options, feedbackPerOption)`), mert a kliens a visszajelzést nem látja; a jelző a
  helyes választ nem fedi fel. Hiányzó jelző (régi válasz) → keverés.
- Kérdés, amelynek opciója vagy visszajelzése betűvel / „fenti” szóval más opcióra hivatkozik, nem keveredik
  (`/(^|[\s(„])[A-D]\)|(^|\s)[A-D] (és|vagy) [A-D]\b|„[A-D]”|\b[A-D] válasz|fenti|előző válasz/i`). Az Antigoné 105 kérdéséből 0 ilyen.

## Dokumentált spec-változás (teszt)
- `tests/websuli.spec.ts` (~150. sor) a DOM-pozícióra kattintott (`options.nth(1)` = rossz, `nth(0)` = jó válasz). Keverés után a
  DOM-pozíció nem a tárolt index; a teszt ugyanazt a szándékot az eredeti indexű `check-option-1` / `check-option-0` azonosítóval méri.

- `tests/lesson-fusion.spec.ts` (~25–27. sor) a Kvízben a DOM-pozícióra kattintott (1. kérdés 2. gombja = rossz, a többi 1. gombja = jó,
  elvárt 24/25). A szándék változatlan: a helyes válasz megjelenített helyét a kör `balancedLayouts`-ából számolja.
- `tests/lesson-practice.browser.ts` (nem CI-futás, `playwright.lesson-practice.config.ts`) a gyakorlókörben az első / 4. gombra
  kattintott a tárolt 0. / 3. opcióként. A szándék változatlan: a tárolt indexű opciót a `displayOrder(q.id, …)` szerinti helyén célozza.
- `tests/learning-flow.browser.ts` (nem CI-futás) a „D Kétszeres lesz” nevű gombra kattintott; a betűjel most a megjelenítési helyet
  követi, ezért a tárolt 4. opciót a szövege azonosítja (`/^[A-D] Kétszeres lesz$/`). Ugyanennek a fájlnak az 1–5. tesztje
  („lesson cover and continuous exercise lists fit”) a `main`-en (5b938539) is bukik — meglévő, ettől független hiba.

## Edge case-ek
- 2–4 opció; 1 opció → változatlan.
- Ugyanaz a seed mindig ugyanaz a permutáció (nincs `Math.random`).
- A keverés nem garantál „mindig más” pozíciót — egyenletes eloszlást ad sok kérdésen.

## Elfogadás (EARS)
- HA egy Tananyag- vagy Kvízkérdés megjelenik, AKKOR a gombok sorrendje a lecke / kör `balancedLayouts` elrendezése (ennek része a
  `optionOrder(seed, n)` szerinti kevert többi opció); kontextus nélkül (és a gyakorlókörben) `displayOrder` → `optionOrder`; a betűjel
  A, B, C… a megjelenítés sorrendjében.
- HA a tanuló egy gombra kattint, AKKOR az eredeti index rögzül, és a jó/rossz jelzés és visszajelzés a tárolt `correctIndex` szerint helyes.
- HA az oldal újratöltődik, AKKOR ugyanaz a sorrend jelenik meg, és a mentett válasz ugyanazon az opción látszik.
- HA az Antigoné 7 ellenőrzőjére és 98 kvízkérdésére kiszámoljuk a helyes válasz megjelenített pozícióját, AKKOR opciószámonként a
  pozíciók darabszáma legfeljebb 1-gyel tér el egymástól (mért: ellenőrzők 2/2/1/2; kvíz 3 opciós 18/18/18, 4 opciós 11/11/11/11).
- Review #375 (2. kör): a célpozíciók kiosztása a kérdések seedelt VÉLETLEN sorrendjében történik (nem a megjelenítésében), így egy
  négyes csoport utolsó helyes pozíciója nem következtethető ki; a betűhivatkozás kis-nagybetű-érzékeny, az „A” csak névelővel
  („az A válasz”) jelöl opciót — a közönséges „a válasz” nem hivatkozás.
- Review #375: a mérleg opciószámonként külön fut; a tárolt sorrendű kérdés helyes pozíciója és az ismételt kérdés minden előfordulása
  beszámít; a hivatkozás-felismerés A–E betűt és sorszámos („a második válasz”) hivatkozást is fog.
- Unit: `tests/option-order.test.ts`; e2e: `tests/lesson-verdict.spec.ts`, `tests/lesson-progress-persistence.spec.ts`,
  `tests/websuli.spec.ts` zöld; új e2e: `tests/option-shuffle.spec.ts`.
