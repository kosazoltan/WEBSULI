# Minden játék: évfolyamonként 10 nehezedő pálya · Szólétra: 3D kérdések, angol–német–francia, szókincs-kategóriák (2026-09-29)

## Kérés (tulajdonos, szó szerint összefoglalva)
1. A Szólétra legyen látványosabb: ne csak a létrán lépkedés, a tesztkérdések is 3D-sek legyenek. Az olvashatóság, a
   megfejthetőség és a használhatóság maradjon meg, de gyerekbarát, figyelemfelkeltő, a tanulást ösztönző 3D-ben.
2. Ugyanakkora tudásbank francia és német nyelven; nyelvválasztás. Ne csak kifejezések: szavak, szószedetek,
   rendhagyó és nem rendhagyó (szabályos) alakok is, a hétköznapi nyelv megtanulását segítve — angolul, németül,
   franciául is. Mindegyik nyelven több, fokozatosan nehezedő pálya.
3. Minden játékban évfolyamonként (3.–12.) 10 darab, fokozatosan nehezedő pálya.

## Kiindulás (felderítve)
- Évfolyam: a közös `classroomStore` (1–12). Minden 3D játék a 3–12. évfolyamon a közös évfolyam-bankból kérdez (#136).
  A Villám matek évfolyamonként 41 tanári feladatot és 8–9 sablont használ (#135).
- A nehézség közös sávja a `game-engine/difficulty.ts` (`DIFFICULTY_FLOOR` = 0,15 … 1). A kérdés-szint a
  `gradeQuiz.tierForBand`, illetve a Szólétra `ladderTierIndex` (5 szint: A1, A1–A2, A2, B1, B2), `no-repeat.ts`.
- A Szólétra bankja: `FourChoiceQuiz` tételek az `englishGameQuizExtras.ts`-ben és a `WordLadderHuEn.tsx`-ben, csak angolul.
  A 3D a létra-jelenetre korlátozódik (#129), a kérdéskártya DOM-ban van (`wl-option-*`, `data-correct`, 44 px, E2E).
- A Tornádó saját 200 pályás világot és egy 12 sávos AUTO-táblát használ (`lib/tornado/questions.ts`).

## Nem cél
A pontozás és a jutalom-szabály, a szerveroldali bankok, a tananyag-kvízek logikája, és a meglévő játékmenetek alapszabályai.

## Rögzített döntések
1. **Közös pálya-modul** `client/src/game-engine/gradeLevels.ts` (tiszta, tesztelt):
   - `GRADE_LEVEL_COUNT = 10`.
   - `levelBand(level)`: a pálya kezdő nehézségi sávja, 1 → `DIFFICULTY_FLOOR` (0,15), 10 → 0,95, lineárisan. A futás
     közbeni adaptív sáv (difficulty.ts) innen indul, és a pálya sávja körül legfeljebb ±0,15-tel mozdulhat
     (`clampToLevel(band, level)`), így a 10. pálya végig nehezebb marad az 1.-nél.
   - Haladás: `loadUnlockedLevel(gameId, grade)` / `unlockNextLevel(gameId, grade, level)`. Kulcs:
     `websuli.levels.<gameId>.<grade>`, az alapérték 1, a legnagyobb 10. Sérült vagy hiányzó érték esetén 1. A
     localStorage-hiba nem dob.
   - Feloldás: a pálya teljesítése (a játék saját, meglévő győzelmi vagy teljesítési feltétele) a következő pályát oldja fel.
2. **Közös pályaválasztó** `client/src/game-engine/GradeLevelPicker.tsx`:
   - 10 gomb (≥ 44 × 44 px, felirat „N.”, `aria-label` „N. pálya”);
   - a lezárt pálya `disabled` és lakat ikont kap;
   - a kiválasztott pálya kiemelt;
   - `data-testid="level-picker"`, gombonként `level-<n>`;
   - 390 px-en egy vagy két sorban, vízszintes görgetés nélkül.
3. **Bekötés mind a 7 játékba** (Aszteroida, Kockavadász, Brain Rot, Szökőár, Tornádó, Villám matek, Szólétra):
   - A menüben az évfolyam mellett a pályaválasztó jelenik meg.
   - A kiválasztott pálya adja a kezdő sávot. Ez hat a kérdés-szintre (a meglévő sáv→szint leképezés) és a játék
     meglévő, sávfüggő tempó-paramétereire (idő, sebesség, sűrűség).
   - A győzelem feloldja a következő pályát.
   - A Tornádó a kiválasztott évfolyam AUTO-tábla-tartományából 10 egyenletesen elosztott világpályát rendel az
     1–10. pályához (az 1. a tartomány eleje, a 10. a vége). A meglévő „Szintek” képernyő megmarad.
   - A Villám matek célszáma és ideje (#135, `speedQuizTiming.ts`) évfolyamonként változatlan. A pálya a feladatok
     nehézségét (tanári bank vagy sablon, számtartomány) és a kérdésidő-szorzót a sávon át hangolja, a sávfüggő
     kérdésidő alsó határa (20 s) megmarad.
4. **Szólétra nyelvek:**
   - `WordLadderLanguage = "en" | "de" | "fr"`;
   - a menüben nyelvválasztó (Angol, Német, Francia; ≥ 44 px), tárolva: `websuli.wordladder.lang`;
   - a prompt: „„X” angolul / németül / franciául:” és a fordított irány is (idegen → magyar);
   - a magyarázat mindig magyar.
5. **Szólétra-bank, nyelvenként** `client/src/data/wordLadder/{en,de,fr}.ts`, közös típus a `.../types.ts`-ben:
   - `LadderItem = FourChoiceQuiz & { tier: 0 | 1 | 2 | 3 | 4; category: LadderCategory }`.
   - `LadderCategory = "word" | "topic" | "phrase" | "irregular" | "regular" | "everyday"`:
     - szó;
     - témakör-szószedet: család, iskola, étel, otthon, város, idő, test, ruha, időjárás, szabadidő;
     - kifejezés;
     - rendhagyó alak (rendhagyó igék, többes szám, fokozás);
     - szabályos alak (szabályos ragozás, képzés, többes szám);
     - hétköznapi helyzet.
   - Nyelvenként (az angolra is): szintenként ≥ 124 / 122 / 94 / 64 / 64 tétel (összesen ≥ 468), kategóriánként
     ≥ word 110, topic 90, phrase 60, irregular 50, regular 50, everyday 60.
   - Az angolban a meglévő 468 tétel kategóriát és szintet kap, és kiegészül a hiányzó kategóriákkal.
   - Egy tétel egy sor; pontosan egy helyes opció; 4 különböző opció.
   - A magyarázat 30–300 karakter, a helyes opció egy kulcsszavát szó szerint tartalmazza, sorrendre nem hivatkozik.
   - Azonosító: `<lang><tier>-<nnn>`, egyedi.
   - Németben a főnév névelővel és nagybetűvel; franciában névelővel (nem jelölve) és ékezetekkel.
   - Minden új tételt független vak megoldó ellenőriz (más modellcsalád, kulcs nélkül, opciónként); jelzésnél kézi újraszámolás vagy újragondolás.
6. **Szólétra-pályák:**
   - a 10 pálya a nyelv és az évfolyam alapszintjéből indul;
   - a pálya a szint-eltolást (`ladderTierIndex` sávja) és a létra hosszát adja: 1. pálya rövid, könnyű; 10. pálya hosszú, a legfelső szintről;
   - évfolyamonként és nyelvenként külön haladás (`gameId` = `wordladder-<lang>`);
   - futáson belül nincs ismétlés (#135 `pickUnseen`).
7. **3D kérdések a Szólétrában:**
   - A kérdéstábla és a 4 válaszlap a three.js jelenetben van, kamerával szembe forduló, torzításmentes lapokon (legfeljebb 12°-os perspektíva).
   - A felirat vászon-textúrán jelenik meg: a 390 px-es nézetben ≥ 20 CSS px-nek megfelelő betűméret, kontraszt ≥ 4,5:1.
   - Kattintás és érintés raycasttal, billentyűzeten 1–4; jó és rossz válaszra 3D visszajelzés (a csökkentett mozgás tiszteletben tartva).
   - A DOM-gombok megmaradnak (`wl-option-*`, `data-correct`, ≥ 44 px, képernyőolvasó): átlátszó érintési rétegként pontosan a 3D lapok fölé igazítva.
   - WebGL nélkül vagy low szinten a mai DOM-kártya jelenik meg.
   - A meglévő E2E-k (`games-touch-controls`, `game-win-paths` Szólétra-tesztje) változatlanul zöldek.

## Szeletek (külön ágak, a közös alapra építve)
- **A — közös alap:** ez a spec; `gradeLevels.ts`; `GradeLevelPicker.tsx`; `data/wordLadder/types.ts`; tesztek.
- **B — Szólétra:** 3D kérdések, nyelvválasztó, pályák, az angol bank átstrukturálása és bővítése a kategóriákkal.
- **C — német bank** (`data/wordLadder/de.ts`).
- **D — francia bank** (`data/wordLadder/fr.ts`).
- **E — a többi 6 játék:** pályaválasztó és bekötés.

## Elfogadás (EARS)
- **E1** A `levelBand` SHALL szigorúan növekvő legyen 1-től 10-ig, 0,15-től 0,95-ig; a `clampToLevel` SHALL a sávot a pálya sávja ±0,15-ön belül tartani (teszt).
- **E2** A haladás SHALL alapból 1 legyen, teljesítéskor eggyel nőjön, legfeljebb 10-ig; sérült tárolásnál 1 (teszt).
- **E3** Mind a 7 játék menüje SHALL megjeleníteni a 10 pályás választót (bekötés-őr teszt + böngésző), és a pálya SHALL hatni a kezdő sávra.
- **E4** Nyelvenként SHALL teljesülnie a szint- és kategória-minimumoknak; pontosan egy helyes opció; a vak ellenőrzés 0 nyitott jelzéssel zárul (teszt + napló).
- **E5** A Szólétra kérdései SHALL 3D-ben jelenjenek meg olvashatóan (kontraszt ≥ 4,5, betűméret-mérés böngészőben), a DOM-os hozzáférés és az E2E-k megmaradnak.
- **E6** Kapuk zöldek; valós böngészős ellenőrzés 390 és 1280 px-en, képekkel.

## Review-kör (PR #145)
- **A kérdéstábla betűje helyhiánynál (Copilot): javítva.** A rajzoló a betűt sosem viszi a vállalt minimum (kérdés
  22 px, válasz 20 px) alá; helyhiánynál csak a sorköz szorul. Őrteszt: `word-ladder-3d-review.test.ts`, a javítás
  előtt bukott.
- **Billentyűzetes fókusz 3D módban (Copilot): javítva.** Az átlátszó DOM-gomb `:focus-visible` állapotban 4 px-es
  sárga, nem árnyék-alapú körvonalat kap. Őrteszt ugyanott.
- **„Kimerülés után ismétlés” (Copilot): cáfolva.** A `pickUnseen` viselkedése a #135 spec 1. döntése: a legrégebben
  látott tétel csak akkor jöhet vissza, ha a nyelv MINDEN tétele elfogyott (478–627 tétel nyelvenként). Egy futás ezt
  gyakorlatilag nem éri el, és elfogyáskor a folytatás jobb élmény, mint egy leálló játék. A 7. döntésben a
  „futáson belül nincs ismétlés” ezt a szemantikát jelenti.
