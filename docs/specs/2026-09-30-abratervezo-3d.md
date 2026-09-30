# Spec: Ábratervező ügynök + forgatható 3D-jelenet, Mezopotámia-összefésülés

> Dátum: 2026-09-30 · Szerző: Claude (Opus 5.5) · Állapot: JÓVÁHAGYVA (tulajdonos: „Oké, mehet az általad javasolt megoldás.”)
> Végrehajtás: `docs/specs/2026-09-30-abratervezo-3d-vegrehajtas.md`

## 1. Cél

A tulajdonos szerint a leckék ábrái „nagyon primitívek”. Élő mérés (Mezopotámia 86dfc04d / 8ed51fa9): az ábrák 665–1 950 karakteres
SVG-k, 3–8 alakzattal. **Gyökérok (kódból igazolva):** az ábrakészítő (Claude Opus 5.5) EGYETLEN hívásban rajzolja a lecke
összes (11) fejezetének ábráját, `visuals` szabály szerint 16 000 kimeneti tokennel és `medium` erőfeszítéssel
(`server/ai/studio-provider.ts` STUDIO_STEP_POLICY.visuals) — fejezetenként ~1,4k token jut gondolkodásra és rajzra együtt.

Bake-off (2026-09-30, ugyanaz a 3 fejezet, fejezetenként külön hívás, új ábratervező-skill, `high`, 32k keret):
Opus 5.5 5–9,5k karakteres, izometrikus/térhatású, 5–7 feliratos, számozott, átfedésmentes rajzot adott (3/3 hibátlan
elrendezés); GPT-5.6 Terra 2/3 kilógó felirat; GPT-6 Luna 1/3 átfedés, laposabb rajz. Döntés: **Opus 5.5 marad, de
fejezetenként külön hívással, ábratervező-skillel** („ábratervező ügynök”), plusz új **`scene3d`** ábrafajta: a modell
leíró jelenet-adatot ad, a kliens three.js-szel forgatható 3D-ben rajzolja (a modell kódot nem ír).

Tartalmi cél: a két meglévő Mezopotámia-lecke összefésülése egy teljes leckévé (mindkettő tanít olyat, amit a másik nem),
és a füzet „Babilon városa – Kr. e. 2500 k.” sorának beépítése (mindkét forrás 6. sora; egyik lecke sem tanítja).

## 2. NEM cél

- JPG/raszteres képgenerálás, modell által írt HTML/JS (tulajdonosi döntés 2026-09-30: SVG + scene3d).
- A bank-, lektor-, kapu-logika változtatása; a régi leckék ábráinak tömeges újragenerálása.
- A régi Mezopotámia-anyagok törlése (a tulajdonos törli; 8ed51fa9 marad, amíg ő nem dönt).

## 3. Érintett területek

- `shared/lesson-schema.ts` (ANIM_KINDS + `scene3d`), `shared/lesson-visual-params.ts` (séma, szerződés, kirajzolt szövegek),
  `client/src/lesson-runtime/blocks/scene3d-anim.tsx` (új), `client/src/lesson-runtime/blocks/animate-blocks.tsx` (regiszter).
- `server/studio/visual-designer.ts` (új): fejezetenkénti tervező, párhuzamos hívás, fejezetenkénti célzott újrakérés.
- `server/studio/step-io.ts` (`buildSectionDesignerPrompt`), `server/studio/prompt.ts` (új név `studio.animator.section.v1`),
  `server/studio/role-skills.ts` (animator skill → ábratervező), `server/ai/studio-provider.ts` (`visualDesigner` szabály),
  `server/studio/step-runner.ts` (animátor ág), `server/studio/visual-quality.ts` (`sparse` gyenge-osztály).
- Tesztek: `tests/visual-designer.test.ts` (új), `tests/scene3d-params.test.ts` (új), meglévő regiszter/katalógus tesztek.

## 4. Rögzített döntések és kényszerek

- Modell: `claude-opus-5-5` (a mátrix `animator` sora), tartalék `gpt-5.6-terra` változatlan. Szabály `visualDesigner`:
  `high`, 24 000 kimeneti token, 300 s, `maxRetries: 0`. Párhuzamosság 4. Fejezetenként 1 ábra (legfeljebb 2).
- A fejezet-folt ugyanaz az alak, mint eddig (`{index, visuals:[…]}`); a beillesztés és minden őr az `applyVisualPatch`
  (felirat a lecke szövegéből, kontraszt, elrendezés, tanított fogalom). Egy fejezet hibája nem veszti el a többit.
- Fejezetenként legfeljebb 1 célzott újrakérés az elutasítás/gyengeség okával. A régi egész-leckés újrakérés csak tartalék.
- DB-s prompt-felülírás: az új kulcs (`studio.animator.section.v1`) külön; a régi `studio.animator.v1` felülírás nem írja
  felül a fejezetenkénti promptot. A skill (`animator`) a kulcs előtagja alapján kerül a prompt elejére.
- `scene3d` paraméterek (zod, szigorú): `objects` 1–40 db; `shape` ∈ box | cylinder | cone | sphere | stairs | plane | river;
  koordináták −10…10, méretek 0,05…20, szín `#rrggbb`, opcionális `label` (≤ 40 karakter), `labels` legfeljebb 8;
  `river` pontsor 2–12 ponttal. Nincs szabad szöveg a kódban; a feliratok a `renderedVisualTexts`-ben → a címke-őr látja.
- Kliens: three.js lazy import (a lecke-bundle nem nő a 3D nélküli leckéknél), húzással forgatás (`touch-action: pan-y`,
  a függőleges görgetés marad), HTML-feliratok vetítéssel (éles, kontrasztos). WebGL hiányában a feliratlista + caption.
- Skill-hossz < 5200 karakter (teszt: studio-role-skills).

## 5. Edge case-ek

- Rajzolhatatlan fejezet (hibák, ellenőrzés) → a tervező kihagyhatja (üres visuals); a meglévő tartalék (`ensureSectionVisuals`) marad.
- Egy fejezet hívása hibázik / időtúllép → a többi fejezet ábrája megmarad; a hibás fejezet régi ábrája marad.
- Csak-bank kör (`reusedVisuals`) → nincs tervező-hívás (változatlan).
- `scene3d` érvénytelen → elutasítás okkal, célzott újrakérés; a kliens érvénytelen paraméternél nem rajzol.
- Mobil: 317 px szélesség, a 3D-vászon arány 4:3, a feliratok nem lóghatnak ki (vetítés után a vászonra szorítva).

## 6. Elfogadási kritériumok (EARS)

- WHEN az animátor lépés fut egy N fejezetes leckén THEN the system SHALL fejezetenként külön ábratervező-hívást indítani
  (legfeljebb 4 párhuzamosan), és a kapott foltokat egy leckébe illeszteni.
- WHEN egy fejezet ábráját a program elutasítja THEN the system SHALL azt a fejezetet egyszer újrakérni az okkal, a többit nem.
- WHEN egy `scene3d` blokk érvényes THEN the client SHALL forgatható 3D-jelenetet rajzolni a feliratokkal; WHEN érvénytelen THEN SHALL nem rajzolni.
- WHEN egy illusztráció 10-nél kevesebb rajzelemet tartalmaz THEN the system SHALL gyengének (`sparse`) jelölni.
- WHEN az összefésült Mezopotámia-lecke kész THEN it SHALL tanítani mindkét régi lecke fogalmait (lásd végrehajtás §5
  ellenőrzőlista) és „Babilon … Kr. e. 2500 körül” állítást; a kapuk (séma, fedettség, ív, experience, bank) zöldek.
- WHEN az új ábrák élesben megjelennek THEN 375 px és 1280 px szélességen nincs átfedés, kilógás, JS-hiba (Playwright).

## 7. Tesztterv

`npx tsx --test tests/visual-designer.test.ts tests/scene3d-params.test.ts tests/animate-try-kinds.test.ts
tests/studio-author-catalog.test.ts tests/studio-role-skills.test.ts tests/role-skills-everywhere.test.ts
tests/lesson-visual-params.test.ts tests/animator-invariants.test.ts`, `npm run check` (tsc), böngészős mérés a
`websuli-visual-probe` launch-konfigurációval, élő futás a `source/web-live-mezo-kombi.local.mts` alapján.

## 8. Kockázatok / visszavonás

- Költség: ábránként ~0,15–0,30 USD (Opus 5.5: 4/20 USD per M token, mért 7–14k kimeneti token) → leckénként 2–3,5 USD.
  Ha sok: `visualDesigner` erőfeszítés `medium`-ra (1 sor). Visszavonás: a runner tervező-ága egy feltétel mögött van
  (`STUDIO_VISUAL_DESIGNER=off` → régi egyhívásos út).
- Időtartam: 4 párhuzamos szál × ~90–150 s → 12 fejezet ~6–8 perc (korábban egy ~3 perces hívás).
