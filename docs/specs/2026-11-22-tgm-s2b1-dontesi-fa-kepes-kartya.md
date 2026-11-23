# S2b-1 — döntési fa és képes kártyák (terv-kiegészítés, önálló szelet)

Alap: [`docs/specs/2026-11-18-tananyag-gyartas-minoseg.md`](2026-11-18-tananyag-gyartas-minoseg.md) (S2b) és a végrehajtási utasítás
„S2b” fejezete (`docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md`, 355. sortól). Eredetileg a változatossági lánc
tervének (`2026-11-20-tgm-valtozatossag-abrak.md`, 16. szakasz) része volt; a 2026-11-22-es leltár szerint a kódja a láncra nem épül,
ezért önálló, a friss főágról átvett szelet (`feat/tgm-s2b1-v2`), a 16. szakasz szövegével.

## Cél és kapcsoló

Két új forrás-ábrafajta megjelenítője: `decisionTree` és `pictureCards`. Kapcsoló: `STUDIO_SOURCE_VISUALS` (a modell kimenetének határa
KI állapotban az új fajtát a bővítés előtti hibával utasítja el — `legacyAnimKindSchema`); a megjelenítés a tárolt leckén kapcsolótól
független (mint az S2a-nál). Alapból KI: az éles gyártás kérései bájtra a főágéval azonosak (`tests/source-visuals-flag.test.ts`).

## NEM cél

- Az S2b-2 vak-leletei (görgetésjelző, kontraszt-őr, kisfilm, tábla legkisebb szélessége, nyomtatás, `useHeaderFit`) — következő PR.
- Az ábrakészítő állomás forrásra kötése (S3a) és az éles bekapcsolás (tulajdonosi döntés).

## Bontás

A TGM-végrehajtás S2b-je a két megjelenítőn felül nyolc vak-leletet is kötelezővé tesz (vak J2, J5, J6, J7, J11, J12, tt J6, tt J9) —
együtt jóval 400 sor fölött. Ezért két alszelet:

- **S2b-1 (ez a PR):** `decisionTree` és `pictureCards` — `ANIM_KINDS` + `SOURCE_VISUAL_ANIM_KINDS` + `SOURCE_VISUAL_SCHEMA_KINDS`
  (a hibás paraméterű blokk nem rajzol, a szerzői kimenetből kimarad), szigorú paraméter-sémák a megosztott szerződés alakjával
  (`shared/source-visual-render.ts`; fordítási őr), `renderedVisualTexts` (lektor-nézet és címke-őr), feliratok (`ANIM_LABELS`),
  megjelenítők (sávtokenes CSS), tt J6 (a fedettségi kapu a két fajtát „megjelent”-nek méri — teszt), vak J12 (`branchYes / branchNo`
  a fa alapértelmezett ágfelirata). Böngészős próba: kétszintű háromágú fa, Igen / Nem fa, 8 képes kártya, 360×640, 844×390,
  1280×800, képernyőképpel.
- **S2b-2 (következő PR):** vak J2, J5, J6, J7, J11, tt J9.

## Sémák

`decisionTree` `{ root: Node }`, `Node = { text ≤ 120, branches?: 2..4 × { label ≤ 40, node } }`, legfeljebb 3 szint, összesen ≤ 13
csomópont. `pictureCards` `{ cards: 2..8 × { label ≤ 40, svg ≤ 6000 (a meglévő illusztráció-tisztítón át), caption? ≤ 80, example? ≤ 120 } }`.

## Edge case-ek

- Hibás paraméterű új fajtájú blokk → nem rajzol, a szerzői kimenetből kimarad.
- `<script>`-et tartalmazó kártya-SVG → a tisztító után ártalmatlan.
- KI kapcsoló → a modell kimenetében az új fajta a korábbi hibával bukik; a tárolt leckében (ha BE állapotban készült) megjelenik.

## Elfogadás (EARS)

- **V29** — THE séma SHALL elutasítani a 4 szintű fát, az 1 ágú csomópontot, a 14 csomópontos fát és a 9 kártyát; a `<script>`-et
  tartalmazó kártya-SVG SHALL ártalmatlan maradni.
- **V30** — WHEN `STUDIO_SOURCE_VISUALS` KI, THE modell kimenetének sémája SHALL a két új fajtát a korábbi hibával elutasítani
  (lenyomat-teszt zöld).
- **V31** — THE fedettségi kapu SHALL a forrás döntési fáját és képes kártyáit a megfelelő blokk mellett „megjelent”-nek mérni.
- **V32** — THE fa két levele SHALL ugyanannak a szülőnek két gyereke lenni a DOM-ban (nem nyíllal összekötött sor), és a három nézetben
  SHALL átfedés, levágás és oldalszintű vízszintes görgetés nélkül megjelenni (böngészős próba, képernyőkép).

<!-- acceptance-checklist -->
- [ ] V29 sémahatárok és SVG-tisztítás
- [ ] V30 KI kapcsolónál a modell-séma változatlan
- [ ] V31 fedettségi kapu: megjelent
- [ ] V32 DOM-szerkezet és böngészős próba

## Vak kör 1 (2026-11-22) — pontosítások

- **Elrendezés (L1):** vízszintes elágazás csak kis fánál (a gyökér alatt kizárólag levelek, legfeljebb 4 ág) és 640 px fölött; minden
  más fa behúzott, egymásba ágyazott lista minden szélességen (`decisionTreeLayout`). A böngészős próba 13 csomópontos (4 ág × 2 levél)
  fát is mér.
- **Képes kártyák (L2):** a tisztított SVG saját azonosítói és belső hivatkozásai kártyánként névterezve (`namespaceSvgIds`) — két rajz
  azonos helyi azonosítója nem ütközik.
- **Vezetővonal (L3):** saját szín (`--sv-tree-line`), a vízszintes összekötő folytonos (a testvérágak között nincs rés).
- **Ágfelirat (L4, a fenti „vak J12” mondat helyett):** alapértelmezett ágfelirat NINCS — az ág `label` mezője kötelező, a forrásból jön;
  a `branchYes / branchNo` szótári kulcsok szándékosan törölve.
- **Mélységi határ (L5):** a teszt pontosan 3 szintet elfogad, pontosan 4 szintet elutasít.

## Review #533 (2026-11-23) — pontosítások

- **Szöveghatárok (Copilot):** a megjelenítő határai a forrásleltáréval (`shared/source-visuals.ts`) egyeznek — fa: csomópont 160,
  ágfelirat 60; képes kártya: felirat 60, képaláírás 120, példa 160 karakter. (A korábbi 120 / 40, illetve 40 / 80 / 120 a forrás
  érvényes feliratát elutasította volna.)
- **Véges szintű séma (Copilot):** a fa csomópontsémája a megengedett szintekből épül, nem rekurzív — nagyon mély, sérült tárolt fa
  szabályos paraméterhiba; a szövegbejárás a korlátos olvasón megy (`readDecisionTreeParams`).
- **Kilógó felirat (Codex, Vercel, Copilot):** a képes kártya rajza a gyártási kapun az `illustrationLayoutProblems` ellenőrzést is
  megkapja; a tárolt lecke megjelenítése nem változik.
- **NYITOTT (tulajdonosi döntés):** a forrásleltár fája legfeljebb 4 szint és szintenként 4 ág lehet, a megjelenítő 3 szintet és 13
  csomópontot enged. A nagyobb forrásfa ma nem jeleníthető meg teljesen (a fedettségi kapu élesben `report` módban van, tehát nem
  blokkol). A határok összehangolása vagy a fa bontása az S3a (ábrák a forrásra kötve) tervezési kérdése.
- **Vak kör 4 (L8) — a gyártási kapu és az olvasási út szétválasztva:** a kilógó felirat ellenőrzése a `visualAuthoringProblems`-ben
  (az ábrák állomása hívja), NEM a `visualParamProblems`-ben — azt a lejátszó is hívja (`sourceVisualProblems`), ott a hiba a blokk
  elrejtését jelentené. A hely becslése a tisztító koordinátaszámításával egyezik (`svgLength`: szám, px, em, ex; `dx` / `dy`).
- **Vak kör 5 (L9) — a közös helybecslő változatlan:** az `illustrationLayoutProblems` (a régi `illustration` ábra is ezt használja) a
  főág szerinti marad; a szelet nem módosítja (a KI állapot főági azonossága). A képes kártyák gyártási ellenőrzése csak a biztosan
  kiszámolható helyet ítéli meg (egység nélküli `x` / `y`, nincs `dx` / `dy`). **Ismert korlát:** az `em` / `ex` / `px` / `%` egységgel
  vagy eltolással pozicionált kártyafelirat kilógását a kapu nem ítéli meg — pontos méréshez böngészős `getBBox` kellene (külön jegy).
