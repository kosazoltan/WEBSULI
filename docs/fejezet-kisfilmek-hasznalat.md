# Fejezetenkénti kisfilmek — így fogod használni

**Mi változott (2026-11-10):** a Stúdió-leckék fejezetei rövid, rajzfilmes, hangos magyarázó kisfilmet kaphatnak.
Terv: [`docs/specs/2026-11-10-fejezet-kisfilmek.md`](specs/2026-11-10-fejezet-kisfilmek.md).

## Amit a tanuló lát

- A fejezetcím mellett **„Kisfilm”** gomb, ha a fejezethez van kész kisfilm. A tananyag tetején **„Kisfilmek lejátszása (N)”**:
  az összes kész kisfilm fejezetsorrendben, egymás után.
- A kisfilm egy rajzolt színpad: a narrátor-kabala beszél, a „táblán” az éppen elhangzó gondolat rajzfilmes képe jelenik meg
  (címkép, fogalom, képlet darabonként, lépések, szembeállítás, mozgó szereplő). Alul felirat. Minden kisfilm ugyanabból a hat
  képsablonból épül, ezért a stílus minden leckében azonos.
- Vezérlés: lejátszás / szünet, előző / következő jelenet, újra, bezárás (Esc is).
- A Célkártya és a nyitómese nem kap kisfilmet.
- Ha a hang nem érhető el, a kisfilm felirattal, némán megy végig. Csökkentett mozgás beállításnál állóképekkel.
- Ha a kisfilmek még készülnek, a tananyag tetején „Készülnek a kisfilmek…” látszik, és a gombok újratöltés nélkül megjelennek.

## Hogyan készül

A kisfilm nem videófájl, hanem rövid **forgatókönyv-adat** (jelenetek: egy elmondott mondat + egy képsablon). A böngésző rajzolja
ki, a hang jelenetenként a meglévő `/api/tts/audio` végpontról jön. Ezért a gyártás másodpercek kérdése, nem kell hozzá
videórenderelés, és a lecke szövege (`lessons.json`) érintetlen marad — a kisfilmek a `lesson_clips` táblában élnek.

1. A tananyagkészítő a leckét a szokott módon közzéteszi.
2. A háttérfolyamat (3 percenként, a közzététel után legkésőbb néhány perccel) minden fejezethez kér egy forgatókönyvet
   (fejezetenként egy modellhívás, három párhuzamosan), ellenőrzi (séma, számhűség: új számadat nem születhet), és eltárolja.
3. A megnyitott lecke 20 másodpercenként újra kérdez, amíg készülnek — a kész kisfilm gombja megjelenik.

## Kapcsolók (Render → `websuli-api-eu` → Environment)

| Változó | Hatás |
|---|---|
| *(semmi)* | Alapállapot: csak a repóban lévő **kézi** kisfilmek jelennek meg; modellhívás nincs, költség nincs. |
| `LESSON_CLIPS_AUTO=on` | Az új (legfeljebb 3 napja közzétett) leckékhez a kisfilmek automatikusan elkészülnek. Kell hozzá a meglévő `OPENROUTER_API_KEY`. |
| `LESSON_CLIP_DAILY_LIMIT` | Naponta legfeljebb ennyi lecke kap gyártást (alap: 10). |
| `LESSON_CLIPS=0` | Vészfék: a háttérfolyamat nem indul, a leckékben nem jelenik meg kisfilm. Telepítés nélkül, azonnal hat (újraindítás után). |

## Kézi kisfilm írása

A `source/server/lesson-clip-seeds.ts` fájlba, a lecke azonosítója alá: fejezetindex, a fejezet címe betűre pontosan, és a
kisfilm (séma: `source/shared/lesson-clip.ts`). A `say` hangosan elhangzik, ezért a képletet szavakkal írd; a jelölés a képre
kerül. A kézi kisfilm az automatikusat felülírja, fordítva soha. Ellenőrzés: `npm test` (a `lesson-clip.test.ts` a sémát méri).
Az első kézi próba a „Dinamika – összefoglaló a 9. osztályos fizikához” lecke 12 fejezete.

## Kipróbálás fejlesztői gépen

`npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite` után: `/__lesson-runtime-probe?fusion=1&clips=1` (mind a hat képsablon),
`…&clips=pending` (a „készülnek” jelzés). Böngészős teszt: `npx playwright test -c playwright.lesson-clips.config.ts --trace off`.

## Amit MÉG nem tud

- A hang a meglévő tartalék hangvégpont (gépi magyar hang). Szebb hangra (pl. neurális magyar hang) később a hangvégpont
  cserélhető, a kisfilm-adat változatlan marad.
- A régi leckék nem kapnak visszamenőleg kisfilmet (csak a legfeljebb 3 napos leckék); ehhez külön döntés és költségkeret kell.
- Az automatikus forgatókönyvet gépi kapu csak a számokra és a formára ellenőrzi; a mondatok tartalmi helyességét az első éles
  futásokon érdemes szemmel megnézni, mielőtt a kapcsoló tartósan bekapcsolva marad.
- Egy 12 fejezetes lecke összes kisfilmje együtt kb. 6 perc (fejezetenként kb. fél perc).

## Visszavonás

`LESSON_CLIPS=0` → azonnali kikapcsolás. Végleges: a változtatás visszavonása és a `lesson_clips` tábla eldobása (a leckék
tartalma nem függ tőle).
