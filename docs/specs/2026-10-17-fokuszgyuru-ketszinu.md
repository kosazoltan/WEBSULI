# Spec: kétszínű fókuszgyűrű a témás tananyag-lejátszóban

> Dátum: 2026-10-17 · Szerző: Claude (tulajdonosi kérésre) · Állapot: JÓVÁHAGYVA (a tulajdonos kérte a munkát)
> Végrehajtás: `docs/specs/2026-10-17-fokuszgyuru-ketszinu-vegrehajtas.md`

## 1. Cél

Az élő lecke-arculat (`source/client/src/lesson-runtime/lesson-design.css`) billentyűzetes fókuszjelzője ma egyetlen
3px-es borostyán (`#F4AB37`) keret. Ez a világos témák csempéin és felületein 1,72–1,96:1, a mesterutasítás
(`docs/design/Websuli_Design_AI_Implementacios_Utasitas.md` §2 6. pont) grafikus minimuma (3:1) alatt. A statikus mintán
(`docs/design/Websuli_Tanuloi_Keret_Minta.html`, PR #270, ág `docs/tanuloi-keret-minta`) már kétszínű gyűrű van; ugyanezt
kell az élő lejátszóba vinni úgy, hogy mind az öt témán (és a Csendes nézetben) legalább az egyik szín ≥ 3:1 legyen a
téma alapfelületén, csempéjén és halvány felületén.

## 2. NEM cél

- A témák színtokenjei (`shared/lesson-design.ts`, a `--ws-*` értékek) nem változnak.
- A nem témás leckék (régi `lesson-theme.css`, `lesson-experience.css`, `decision-story.css`, `triangle-lab.css`) fókusza
  érintetlen.
- A referencia (`docs/design/Websuli_Design.html`) és a statikus minta nem változik.

## 3. Érintett területek

- `source/client/src/lesson-runtime/lesson-design.css` — a fókuszszabály (166–168. sor) és a fejléc-komment (9. sor).
- `source/tests/lesson-design.test.ts` — a fókuszszabály szövegére vonatkozó állítás (dokumentált spec-változás) és új
  kontraszt-állítás.
- `source/tests/lesson-design.spec.ts` — valódi böngészős fókuszmérés és képernyőkép.

## 4. Rögzített döntések és kényszerek

- Gyűrű (a minta értékei): `outline: 3px solid #F4AB37; outline-offset: 3px; box-shadow: 0 0 0 3px #10233C;`. A sötét
  belső gyűrű (az elem szélétől 0–3px) és a borostyán külső gyűrű (3–6px) egymás mellett fekszik, így együtt 6px.
- Mért kontraszt (WCAG relatív fénysűrűség, a teszt `contrastRatio` függvényével egyező képlet):

  | téma | felület / csempe / halvány | borostyán | sötét belső |
  |---|---|---|---|
  | explorer | #E9F9E9 / #FFFFFF / #E5F8ED | 1,79 / 1,96 / 1,77 | 14,45 / 15,82 / 14,30 |
  | adventure | #FFF0D2 / #FFFFFF / #FFF3DF | 1,74 / 1,96 / 1,78 | 14,04 / 15,82 / 14,41 |
  | studio | #EFEFFF / #FFFFFF / #EFEFFE | 1,72 / 1,96 / 1,72 | 13,90 / 15,82 / 13,89 |
  | laboratory | #E6F3FF / #FFFFFF / #E6F3FC | 1,74 / 1,96 / 1,73 | 14,03 / 15,82 / 14,00 |
  | future | #132540 / #233956 / #1B3150 | 7,85 / 5,99 / 6,70 | 1,03 / 1,35 / 1,21 |
  | Csendes nézet | #F7F6F2 / #FFFEFA / #EEEFEA | 1,81 / 1,94 / 1,69 | 14,63 / 15,67 / 13,69 |

  A két gyűrű egymáshoz: 8,08:1. Minden háttéren legalább az egyik szín ≥ 3:1 (WCAG C40 kétszínű technika).
- Specifikusság: a szabály szelektora `[data-band][data-experience][data-ws-theme] :is(…):focus-visible` (0,5,0), hogy a
  témás elemek saját `box-shadow` szabályai (pl. `.fusion-tabs button` 0,2,1) ne nyomják el a sötét gyűrűt.
- A kiválasztott fül saját belső kerete (`inset 0 0 0 2px var(--ws-accent)`) fókuszban is megmarad: külön szabály a két
  árnyékot együtt adja.

## 5. Edge case-ek

- Sötét `future` téma: a sötét belső gyűrű a felületbe olvad, a borostyán viszi a jelzést (≥ 5,99:1).
- Csendes nézet (`data-quiet="true"`): világos paletta minden témán; a sötét gyűrű viszi a jelzést.
- Kiválasztott fül fókuszban: a belső főszín keret + sötét gyűrű + borostyán körvonal egyszerre látszik.
- Egérkattintás: `:focus-visible` miatt nem jelenik meg gyűrű (változatlan viselkedés).

## 6. Elfogadási kritériumok (EARS)

- WHEN egy témás lecke interaktív eleme billentyűzettel fókuszt kap THEN the system SHALL 3px `#F4AB37` körvonalat
  (3px eltolással) és 3px `#10233C` külső árnyékgyűrűt rajzolni.
- WHEN a fókuszgyűrű színeit bármelyik téma (és a Csendes nézet) alapfelületéhez, csempéjéhez vagy halvány felületéhez
  mérjük THEN the system SHALL legalább az egyik színnel ≥ 3:1 kontrasztot adni.
- WHEN a kiválasztott fül fókuszt kap THEN the system SHALL a főszínű belső keretét is megtartani.

## 7. Tesztterv

- `source/tests/lesson-design.test.ts`: a fókuszszabály a kétszínű értékekkel; témánként (+ Csendes nézet) a CSS-ből
  kiolvasott `--ws-surface`, `--ws-panel`, `--ws-soft` értékeken a max(borostyán, sötét) ≥ 3.
- `source/tests/lesson-design.spec.ts`: Tab-billentyűs fókusz után a számított `outline-color` / `box-shadow` értéke és
  a gyűrű kontrasztja a számított háttérhez; képernyőkép `explorer` és `future` témán
  (`test-results/websuli-design/focus-*.png`).

## 8. Kockázatok / visszavonási terv

- A magasabb specifikusság felülírja a témás elemek fókusz alatti egyéb árnyékát (fókusz idejére). Visszavonás: a commit
  revertje.
