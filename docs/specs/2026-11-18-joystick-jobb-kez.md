# Joystick a jobb kézre, akciógombok a bal kézre (terv)

**Dátum:** 2026-11-18 · **Ág:** `feat/joystick-jobb-kez` (az `origin/main` `99c6dc29` fejéről)
**Végrehajtás:** [`docs/specs/2026-11-18-joystick-jobb-kez-vegrehajtas.md`](2026-11-18-joystick-jobb-kez-vegrehajtas.md)

## A kérés (tulajdonos, szó szerint)

> „A joystick is a bal kézre esik, így jobbkezes embernek nagyon nehéz használni ezt. Erre most jöttem rá, hogy én állandóan bal
> kézzel próbáltam joystickozni, és ezért lehetett rossz a mozgatás. Cseréld meg a jobb és bal oldalt, a joystickot, illetve az
> egyéb tartalmakat pedig, a tűzgombot, ilyesmit rakd át bal kézre. Azt sokkal könnyebb kezelni az ügyetlen kézzel is.”

## Cél

1. Minden játékban, ahol képernyő-joystick van, a joystick ALAPBÓL a képernyő JOBB oldalán áll (jobb hüvelykujj), a többi
   akciógomb (tűz, bomba, ugrás, bányász, lerak, horgony, kamera) és a kísérő tartalom a BAL oldalon.
2. Egy közös, eszközön megjegyzett kapcsoló („Joystick oldala: Jobb oldalt / Bal oldalt”) a szünet menüben — balkezes
   tanulóknak. Alapérték: jobb oldal.
3. A súgószövegek a beállítást követik (nem mondanak „bal hüvelykujjat”, ha a joystick jobbra van).

## Nem cél

- A játékmenet, a mozgás iránya, a joystick görbéje, holtsávja, sugara, érzékenysége (`game-engine/joystick.ts`,
  `controlSize.ts`, `shapeJoystick`, `touchDriveInput`) — változatlan.
- Billentyűzetes / egeres vezérlés (asztali gép): változatlan; az érintővezérlő érintés nélküli eszközön ma sem jelenik meg.
- A Tornádóvadász tárolt haladásának sémája (`lib/tornado/progress.ts` `settings.leftHanded`): a mező megmarad, de a
  vezérlő elrendezése már nem ezt olvassa (lásd D4). Séma-takarítás külön jegy.
- A párhuzamos ágak játék-átépítései (lásd „Várható ütközések”).

## Felmérés (a kódból, `origin/main` `99c6dc29`)

A közös vezérlő: `source/client/src/game-engine/VirtualJoystick.tsx` (lebegő tárcsa, `data-testid="virtual-joystick"`),
`source/client/src/game-engine/HoldButton.tsx` (nyomva tartható gomb), a közös vezérlősáv CSS-e
`source/client/src/index.css` `.game-touch-layer` (flex sor, `justify-content: space-between`). A közös keret:
`source/client/src/game-engine/mobile/GameShell.tsx` (`.game-shell-fixed`), a közös szünet menü:
`source/client/src/game-engine/mobile/PauseMenu.tsx`. A közös, tartós játékbeállítás:
`source/client/src/game-engine/play/gameSettings.ts` (`localStorage` `websuli.gameSettings.v1`, ma egyetlen mező: `tts`).

`<VirtualJoystick>`-ot pontosan öt lap használ (Grep `VirtualJoystick` a `source/client/src/pages` alatt):

| Játék (lap) | Vezérlősáv | Joystick ma | Akciógombok / kísérő tartalom ma | Oldal-beállítás ma |
|---|---|---|---|---|
| Szökőár (`TsunamiEscapeEnglish.tsx`) | `.tsunami-controls.game-touch-layer` (közös sáv) | bal | „Ugrás” (`HoldButton`) jobb | nincs |
| Tornádóvadász (`TornadoHunter200.tsx`) | `.game-touch-layer` (közös sáv), a tárcsa és a gombok egy-egy burkoló `div`-ben | bal | „Kamera”, „⚓” jobb | saját: `progress.settings.leftHanded` (kezdő beállítások + szünet menü „Jobbkezes / Balkezes”), JSX-sorrenddel |
| Galaktikus Aszteroida (`SpaceAsteroidQuiz.tsx`) | saját `.sa-controls` (flex sor) | bal | `.sa-actions`: bomba (belül) + „Tűz” (kívül) jobb | nincs |
| Kockavadász (`BlockCraftQuiz.tsx`) | `.game-touch-layer.bc-touch-layer` (közös sáv) | bal | `.bc-actions` rács: Lerak, Bányász, Ugrás jobb; a körbenézés a vászon JOBB 60%-án indul (`isLookZone`, `LOOK_ZONE_START = 0.4`) | nincs |
| Brain Rot (`BrainRotSteal.tsx`) | saját `.br-controls` (álló: sor; fekvő: oszlop a tábla mellett) | bal (fekvőben a bal oldali oszlop alján) | `.br-controls-side`: súgó / állapot, kombó, kérdés alatti szünetgomb — jobb | saját: `localStorage` `websuli.brainrot.hand` (`data-hand`), kezdő beállítások „Jobbkezes (bal oldalt) / Balkezes (jobb oldalt)” |

Nincs joystick (nem érintett): `SpeedQuizMath.tsx`, `WordLadderHuEn.tsx`, `DuelOnline.tsx` (online párbaj — nincs
`VirtualJoystick`, nincs `.game-touch-layer`), `PlayLab.tsx` (labor-lap: `.game-touch-layer`, de sávváltó gombokkal, joystick
nélkül — a megoldás a joystick elemére hat, így ez a lap nem változik).

Oldalhoz kötött szövegek (Grep „hüvelykujj”, „Bal:”, „Jobbkezes”, „Balkezes”):

- `SpaceAsteroidQuiz.tsx`: „Bal hüvelykujj: joystick · jobb: tűz (célzássegéddel) · középen a bomba.”
- `BlockCraftQuiz.tsx`: „Bal hüvelykujj: mozgás (tárcsa) · jobb hüvelykujj: körbenézés húzással · …” és a játék közbeni
  „Bal: mozgás · jobb: nézelődés · koppintás: bányászás”.
- `BrainRotSteal.tsx`, `TornadoHunter200.tsx`: a saját „Jobbkezes / Balkezes” gombok.
- A Szökőár érintős súgója („Húzd az ujjad: ← → sáv, ↑ ugrás”) oldalsemleges.

Oldalhoz vagy képernyő-koordinátához kötött tesztek:

- `source/tests/brainrot-play.spec.ts` „K.4/16: balkezes tükrözés” — a `br-hand-left` gombot és a `websuli.brainrot.hand`
  kulcsot használja.
- `source/tests/blockcraft-two-finger.spec.ts` — a körbenéző ujj a vászon 75%-án, a „nem forgat” ujj a 20%-án.
- `source/tests/blockcraft-mobile.test.ts` — forrásminta: `isLookZone(e.clientX - rect.left, rect.width)` és a tesztcím
  („jobb 60%”).
- `source/tests/game-settings.test.ts` — a tárolt alak `{ v: 1, tts }` pontos egyezése.
- A többi joystickos teszt (`joystick-response.spec.ts`, `games-touch-controls.spec.ts`, `tsunami-play.spec.ts`,
  `game-mobile-quality.spec.ts`) a joystick és a gombok TÉNYLEGES dobozából számol, oldalfüggetlen.

## Megoldás

### D1 — egy közös beállítás: `joystickSide`

`game-engine/play/gameSettings.ts`: `GameSettings = { v: 1; tts: boolean; joystickSide: "right" | "left" }`, alapérték
`"right"`. Ugyanaz a kulcs (`websuli.gameSettings.v1`), ugyanaz a `v: 1` — a mező additív: a régi tárolt alak (mező nélkül)
érvényes marad és `"right"`-ot ad; bármi, ami nem pontosan `"left"`, `"right"`. Új hook: `useJoystickSide()`. Személyes adat
nincs benne; csak az eszköz `localStorage`-ában él (a meglévő `tts` mintája), hiba / privát mód esetén a menetre érvényes.

### D2 — a közös keret hirdeti, a közös joystick olvassa

- `GameShell` gyökere: `data-joystick-side="right|left"` (a beállításból).
- `VirtualJoystick` gyökere: `game-joystick` osztály. Közös szabály az `index.css`-ben:
  `.game-shell-fixed[data-joystick-side="right"] .game-joystick { order: 1; }` — a flex sávban a joystick az utolsó helyre
  (jobb szél) kerül, a többi elem balra. A DOM-sorrend és a `memo`-zott vezérlősávok nem változnak (nincs újrarenderelés,
  a tárcsa belső állapota megmarad).
- A játékonkénti tükrözés (a gombcsoport belső rendje, a Brain Rot fekvő oszlopa) szintén a keret attribútumára épülő CSS.

### D3 — játékonként

| Játék | Változás |
|---|---|
| Szökőár | A közös szabály elég álló és fekvő nézetben is (joystick jobb, Ugrás bal): a `.tsunami-controls.game-touch-layer` sáv mindkét nézetben a jelenet teljes szélességét fogja (böngészőben mérve 360×640, 390×844, 844×390 méreten). A lap kódja nem változik, csak a megjegyzése. Megjegyzés: az `index.css` régi fekvő `.tsunami-layout` rács-szabálya (jobb oldali 240 px-es hasáb) a mai lapra nem hat — a mért elrendezésben a sáv teljes szélességű. |
| Tornádóvadász | A tárcsa burkoló `div`-je megszűnik (a `.game-touch-layer > *` már ad `pointer-events: auto`-t), így a közös szabály hat. A gombsor belső rendje tükröződik (a ⚓ mindig a külső szélen). A saját „Jobbkezes / Balkezes” gombok helyére a közös kapcsoló kerül (kezdő beállítások); a szünet menüben a közös kapcsoló jelenik meg. |
| Aszteroida | `.sa-controls`: közös szabály; `.sa-actions` belső rendje tükröződik (a „Tűz” mindig a külső szélen, a bomba belül). |
| Kockavadász | Közös szabály; a `.bc-actions` rács tükröződik (az Ugrás mindig a külső alsó sarokban). A körbenézés zónája a joystickkal ELLENTÉTES 60%: `isLookZone(x, width, side)` — jobb oldali joysticknál a vászon BAL 60%-a. |
| Brain Rot | A saját `leftHanded` állapot és a `websuli.brainrot.hand` kulcs megszűnik; a `.br-controls` / `.br-main` szabályai a keret attribútumát olvassák. Álló: joystick jobb, súgó / állapot bal. Fekvő: a vezérlő-oszlop a tábla JOBB oldalán (joystick alul). A kezdő beállításokban a közös kapcsoló. |

### D4 — a régi, játékonkénti beállítások

A Brain Rot `websuli.brainrot.hand` kulcsát és a Tornádó `settings.leftHanded` mezőjét a vezérlő NEM olvassa tovább, és nem
vándoroltatjuk át. Indok: (1) a tulajdonos új alapértéket kért; (2) a Tornádóban a `leftHanded: false` az alapérték volt,
a „soha nem állította” és a „szándékosan választotta” nem különböztethető meg; (3) aki eddig a „Balkezes (jobb oldalt)”
módot választotta, annak az új alapérték ugyanazt adja. A régi kulcs / mező a tárban marad (nem töröljük, nem írjuk).

### D5 — a kapcsoló helye

Közös komponens: `game-engine/mobile/JoystickSideToggle.tsx` (két gomb: „Jobb oldalt” / „Bal oldalt”, `aria-pressed`,
`data-testid="joystick-side-right|left"`, ≥ 48 px magas). Megjelenik:

- a közös `PauseMenu`-ben, HA a lapon van felcsatolt `VirtualJoystick` (a joystick fel-/lecsatoláskor jelzi a jelenlétét egy
  modul-szintű számlálóban) — így a joystick nélküli játékok és az asztali (érintés nélküli) nézet szünet menüje nem változik;
  alacsony fekvő nézetben a kapcsoló egy sorba tömörül (felirat + két gomb), hogy a játék saját beállítása is kiférjen;
- a Brain Rot és a Tornádó kezdő beállításai között (a megszűnő saját gombok helyén).

A szövegek egy helyen, kódszótárban: `game-engine/mobile/joystickSide.ts` (`JOYSTICK_SIDE_TEXT`, `joystickSideHint`).

## Edge case-ek

| Eset | Elvárt viselkedés |
|---|---|
| Álló telefon (360×640, 390×844) | joystick közepe a képernyő jobb felén, minden akciógomb közepe a bal felén (alapérték) |
| Fekvő telefon (844×390) | ugyanez; a Brain Rotban a teljes vezérlő-oszlop a tábla jobb oldalára kerül (akciógombja nincs, a súgó a joystick fölött áll) |
| Kihajtható telefon / táblagép (széles kijelző) | a sáv a képernyő teljes szélességét fogja (`left` / `right` a biztonsági sávval), a joystick és a gombok a két SZÉLEN maradnak — a hüvelykujj eléri; a tárcsa sugara a meglévő `controlRadiusFor` (52–76 px) |
| Asztali gép billentyűzettel / egérrel | nincs érintővezérlő → nincs változás; a szünet menüben a kapcsoló nem jelenik meg |
| Több érintés (joystick + tűz / ugrás / körbenézés egyszerre) | változatlanul működik: a tárcsa és a gombok saját `pointerId`-t és capture-t tartanak; a Kockavadász körbenéző zónája a joystickkal ellentétes oldalon van, így a két hüvelykujj nem ütközik |
| A képernyő közepe / a kérdés-sáv | a vezérlők a két alsó sarokban maradnak; a kérdés-sáv a vezérlők FÖLÖTT áll (`--play-question-bottom`), nem változik |
| HUD (pontszám, szünet gomb) | a HUD felül marad; a `game-pause` gomb doboza nem metszi sem a joystick, sem az akciógombok dobozát |
| Beállítás váltása szünetben | a vezérlők azonnal átrendeződnek (közös tár, feliratkozás); a futó húzás nincs (szünet) |
| Tároló nem elérhető (privát mód) | alapérték (jobb), a váltás a lap élettartamára érvényes |
| Sérült / régi tárolt beállítás | `joystickSide` hiányában `"right"`; a `tts` értéke megmarad |
| Többjátékos / online párbaj (`DuelOnline`) | nincs joystick → nem érintett; a beállítás eszközönkénti, a szerverre nem megy |
| Biztonsági sáv (kivágás, gesztussáv) | a sáv `--game-safe-*` eltolása változatlan; a tükrözés csak a sorrendet cseréli |

## Tesztek, amelyek a dokumentált spec-változás miatt módosulnak

A mérés szigora (reakcióidő, kitérés, renderszám, érintési méret) sehol nem csökken; csak az oldal változik.

1. `source/tests/game-settings.test.ts` — a tárolt / betöltött alak új mezőt kap (`joystickSide`); az alapérték-állítások
   `{ v: 1, tts: true, joystickSide: "right" }`-ra változnak (D1, additív mező). Új állítások: `"left"` megmarad, ismeretlen
   érték → `"right"`, a régi (mező nélküli) alak → `"right"` a `tts` megtartásával.
2. `source/tests/brainrot-play.spec.ts` „K.4/16” — a régi teszt a megszűnő `br-hand-left` gombot és a
   `websuli.brainrot.hand` kulcsot használta (D4, D5). Új tartalom: alapértéknél a joystick a jobb oldalon; a közös kapcsoló
   („Bal oldalt”) a bal oldalra teszi; a választás a közös `websuli.gameSettings.v1` kulcsban marad meg.
3. `source/tests/blockcraft-two-finger.spec.ts` — a körbenéző ujj a vászon 75%-áról a 25%-ára, a „nem forgat” ujj a 20%-áról
   a 80%-ára kerül (D3: a körbenéző zóna a joystickkal ellentétes 60%; alapértéknél a bal 60%). A húzás iránya, hossza és a
   forgás küszöbe (> 0,2 rad, < 0,01 rad) változatlan.
4. `source/tests/blockcraft-mobile.test.ts` — a forrásminta az új aláírásra (`isLookZone(e.clientX - rect.left, rect.width,
   …)`) változik, a cím „a joystickkal ellentétes 60%”-ra; új állítás: a zóna a beállítást olvassa.

## Új tesztek

- `source/tests/joystick-side.test.ts` (node): alapérték, mentés / betöltés, a szövegszótár oldalhelyessége, a
  Kockavadász-zóna tükrözése, bekötés-őr (a keret hirdeti, a joystick osztálya megvan, a közös CSS-szabály létezik, a lapok
  nem tartanak saját oldal-állapotot).
- `source/tests/joystick-side.spec.ts` (böngésző, `playwright.game-mobile.config.ts`): mind az öt játékban, 360×640,
  390×844, 844×390 méreten a tényleges elem-dobozokból: alapértéknél a joystick közepe a jobb, minden akciógomb közepe a bal
  félen; a szünet menü kapcsolója megfordítja; újratöltés után megmarad; a `game-pause` gombot nem takarja vezérlő;
  joystick + második ujj egyszerre (Szökőár: ugrás, Aszteroida: tűz, Kockavadász: körbenézés). Képernyőkép minden állapotról.
- Mutációs ellenpróba: (a) az alapérték `"left"`-re írva, (b) a közös `order` szabály törölve — mindkettőnél buknia kell.

## Ismert, a változástól független megfigyelés

A Szökőár álló nézetében az érintős kezdő súgó („Húzd az ujjad: ← → sáv, ↑ ugrás”, `.ts-hint`) széle a joystick tárcsája alá
lóg. Ez a változás előtt is így volt (a súgó középen áll, a tárcsa a bal szélét fedte; most a jobb szélét fedi — a
„bal oldalt” képernyőképen a régi állapot látszik). A súgó rövid ideig látszik, a tárcsát nem takarja. A játékot a
`fix/szokoar-tema-es-sebesseg` ág átépíti, ezért itt nem nyúlunk hozzá (külön jegy).

## Várható ütközések a nyitott ágakkal

A próba-összefésülés (`git merge-tree --write-tree HEAD <ág>`, 2026-11-18, a `f511ea5a` fejről) eredménye:

| Ág (mért fej) | Ütközik-e a JELEN változással | Hol, és a feloldás |
|---|---|---|
| `origin/main` (`dc76ba52`, benne a #497 Brain Rot válaszidő) | nem | automatikusan összefésülhető (`BrainRotSteal.tsx`, `brainrot-play.spec.ts` is) |
| `fix/szokoar-tema-es-sebesseg` (`aea6f70b`) | igen, 1 fájl | `TsunamiEscapeEnglish.tsx`: a `TsunamiTouchControls` fölötti megjegyzés (mindkét ág átírta). Feloldás: az ág szerkezete marad (tárcsa + „Sprint” `HoldButton` ugyanabban a `.tsunami-controls.game-touch-layer` sávban), a megjegyzésbe a „közös beállítás szerinti oldal” mondat kerül. Kódütközés nincs; összefésülés után a `joystick-side.spec.ts` Szökőár-eseteit újra kell futtatni (a kétujjas eset az „Ugrás” gombot név szerint keresi — az ágon „Sprint”). |
| `feat/jatek-j3a-kockavadasz-runabanya` (`9083a7c0`) | igen, 1 fájl | `BlockCraftQuiz.tsx` (`isLookZone`, a vászon `pointerdown`, a súgószövegek, a `<style>` blokk). Feloldás: az ág kódjára a jelen változás 5 pontja (terv D3 Kockavadász sor) kézzel átvezetendő; a `blockcraft-mobile.test.ts` forrásmintája követi. |
| `perf/kockavadasz-telefon-gyors` (`9e918bdd`) | nem | automatikusan összefésülhető |
| `feat/jatek-j6a-aszteroida-kristaly` (`9da0e8c2`) | nem | a `SpaceAsteroidQuiz.tsx` automatikusan összefésülhető; összefésülés után ellenőrizendő, hogy az ág megtartotta-e a `.sa-controls` / `.sa-actions` szerkezetet és a `space` bemenet-mérőt |
| `feat/jatek-j7b-tornado-utelagazas` (`bc91a969`) | igen, 1 fájl | `TornadoHunter200.tsx` (`TouchControls`, a beállítások és a szünet menü „Irányítás” blokkja). Feloldás: a `leftHanded` prop és a két „Jobbkezes / Balkezes” blokk törlése az ág kódjában is. |

A `game-sim-determinism-guard.test.ts` és a `quiz-bank-scale-db.integration.ts` ütközése a j3a / j6a / j7b ágakon a `main`-nel
szemben áll fenn (a jelen változás ezeket a fájlokat nem érinti).

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] A1 WHEN nincs tárolt beállítás és érintős eszközön fut bármelyik joystickos játék (5 db) THEN the system SHALL a joystick
  közepét a képernyő jobb felére (x > szélesség / 2), minden akciógomb közepét a bal felére (x < szélesség / 2) tenni —
  360×640, 390×844 és 844×390 méreten, a tényleges elem-dobozokból mérve (15 / 15 eset).
- [ ] A2 WHEN a játékos a szünet menüben a „Bal oldalt” gombra bök THEN the system SHALL a joystickot a bal, az akciógombokat a
  jobb félre tenni újratöltés nélkül, és a választást a `websuli.gameSettings.v1` kulcsban megőrizni (újratöltés után is bal).
- [ ] A3 WHEN a joystick és egy akciógomb (vagy a körbenéző ujj) egyszerre van lenyomva THEN the system SHALL mindkét hatást
  érvényesíteni (Szökőár: oldalmozgás + ugrás; Aszteroida: bemenet + tűz; Kockavadász: előre + forgás > 0,2 rad).
- [ ] A4 WHILE a játék fut THE system SHALL a `game-pause` gombot vezérlő által takaratlanul hagyni (a dobozok metszete 0 px²),
  és a joystick / akciógombok doboza a nézeten belül marad, egymást nem metszik.
- [ ] A5 WHEN a joystick a jobb oldalon van THEN the system SHALL NOT „bal hüvelykujj: joystick / mozgás” szöveget mutatni
  (a súgó a beállítást követi; szótár-teszt mindkét oldalra).
- [ ] A6 WHERE az eszköz nem érintős (asztali) THE system SHALL a vezérlést és a szünet menüt változatlanul hagyni (a kapcsoló
  nem jelenik meg; a meglévő pointer-tesztek zöldek).
- [ ] A7 A joystick reakciómérője (`joystick-response.spec.ts`) változatlan küszöbökkel zöld; a mobil minőségmérő
  (`game-mobile-quality.spec.ts`) az öt játékra zöld.
- [ ] A8 Mutációs ellenpróba: alapérték `"left"` → A1 bukik; a közös `order` szabály nélkül → A1 bukik.
- [ ] A9 Képernyőkép mind az öt játékról alapértékkel és átkapcsolva, 390×844 és 844×390 méreten, megnézve.
