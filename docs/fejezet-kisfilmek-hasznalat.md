# Fejezet-kisfilmek — így fogod használni

**Mi ez (2026-11-10):** a Stúdió-leckék fejezetei rövid, rajzfilmes, hangos magyarázó kisfilmet kapnak, korosztály szerint más
figurával, képi stílussal, mondathosszal és hanggal. Terv: [`docs/specs/2026-11-10-fejezet-kisfilmek-v2.md`](specs/2026-11-10-fejezet-kisfilmek-v2.md).

## Amit a tanuló lát

- A fejezetcím mellett **„Kisfilm”** gomb, ha a fejezethez van kész kisfilm; a tananyag tetején **„Kisfilmek lejátszása (N)”**.
- A kisfilm 3–4 mozgó rajzolt jelenet (kb. 20–40 mp): a kép azt mutatja, amiről a mesélő beszél, a képre pedig pontos ábra úszik
  (cím, képlet, lépések, szembeállítás, grafikon, erőnyilak, vagy a fejezet saját ábrája). Szám és képlet csak az ábrán jelenik meg.
- Korosztály: 1–2. mesekönyv Bodzával, a sünnel; 3–5. festett kaland Zsófival és Marcival; 6. évfolyamtól stilizált rajzfilm figura
  nélkül. Hang: 1–5. évfolyam Vera, 6–12. Csaba.
- Vezérlés: szünet, előző / következő jelenet, újra, felirat ki-be, bezárás (Esc). A Célkártya és a nyitómese nem kap kisfilmet.
- Ha a hang vagy a mozgókép nem érhető el, a kisfilm a tartalék hanggal, illetve állóképpel megy végig.
- Amíg a kisfilmek készülnek: „Készülnek a kisfilmek…”, és a gombok újratöltés nélkül megjelennek.

## Hogyan készül (a lecke közzététele után, a háttérben)

Fejezetenként: forgatókönyv (szövegmodell, a korosztály szabályaival; kapuk: mondathossz, számhűség — új szám az ábrán sem születhet)
→ jelenetenként kezdőkép (képmodell + minőségkapu: szöveg / nem gyerekbarát / nem a jelenet → újrapróba) → hang (ElevenLabs) →
mozgókép a kezdőképből (Seedance 1.5) → átkódolás kicsire (`ffmpeg`) → tárolás. Mért idő: kb. 85 mp fejezetenként; két fejezet
készül egyszerre. A lecke szövege érintetlen: a kisfilm a `lesson_clips`, a média a `lesson_clip_media` táblában él.

## Kapcsolók (Render → `websuli-api-eu` → Environment)

| Változó | Hatás |
|---|---|
| *(semmi)* | Nem gyárt, nem költ; a már kész kisfilmeket kiszolgálja. |
| `LESSON_CLIPS_AUTO=on` | A legfeljebb 3 napja közzétett leckékhez gyárt. Kell hozzá az `OPENROUTER_API_KEY` (megvan). |
| `ELEVENLABS_API_KEY` | A mesélőhang. Nélküle a kisfilm a felolvasás tartalék (gépies) hangjával szól. |
| `OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` | A jóváhagyott próba képmodellje. Nélküle a leckeborító képmodellje rajzol. |
| `LESSON_CLIP_DAILY_LIMIT` | Naponta legfeljebb ennyi lecke kap gyártást (alap: 2). |
| `LESSON_CLIP_MEDIA_MAX_MB` | A médiatábla mérethatára (alap: 400 MB); fölötte a gyártás megáll, a naplóban jelzi. |
| `FFMPEG_PATH` | Az `ffmpeg` helye, ha nincs a PATH-on. `ffmpeg` nélkül a kisfilmek állóképesek (a naplóban jelzi). |
| `LESSON_CLIPS=0` | Vészfék: nem gyárt, és a leckékben nem jelenik meg kisfilm. |

## Élesítés lépései

1. A PR összevonása és telepítése (a `0039` migráció magától lefut).
2. Render Environment: `ELEVENLABS_API_KEY` (megvan), majd `LESSON_CLIPS_AUTO=on`.
3. Egy új lecke közzététele után a Render-naplóban `[lesson-clips]` sorok: fejezetenként „kész: … N kép, N hang, N mozgókép, … kB”.
   Ha „nincs ffmpeg a szerveren” sor jelenik meg, a kisfilmek állóképesek — ekkor szólni kell.
4. A lecke megnyitása: a gombok megjelennek, ahogy a fejezetek elkészülnek.

## Költség és méret (mérve 2026-11-10, két automatikus fejezeten)

- Mozgókép: kb. 0,026 USD / mp → 4 jelenet 5–7 mp-es klipekkel kb. 0,55–0,70 USD fejezetenként. Kép: kb. 0,01 USD / db.
  Hang: 0,5 kredit / karakter (fejezetenként kb. 150–250 kredit). Szöveg- és képkapu-hívások: fillérek.
- Tárolt méret: 1,6–1,8 MB fejezetenként (a nyers klipek 4–7 MB-osak, átkódolva 0,3–0,4 MB).
- Egy 12 fejezetes lecke: kb. 7–9 USD és kb. 20 MB.

## Kipróbálás éles adat írása nélkül

`source/` alól: `OPENROUTER_API_KEY=… ELEVENLABS_API_KEY=… npx tsx scripts/clip-trial.ts <lecke.json> <fejezetindex> <mappa>` — a valódi
gyártósort futtatja egy letöltött leckére (`GET /api/lessons/by-file/<id>`), a kisfilmet és a médiát a mappába írja, méri az időt.
Böngészős teszt: `npx playwright test -c playwright.lesson-clips.config.ts --trace off`.

## Amit MÉG nem tud

- A régi leckék nem kapnak visszamenőleg kisfilmet (csak a legfeljebb 3 naposak).
- A forgatókönyv tartalmát gépi kapu csak a formára és a számokra ellenőrzi; a mondatok helyességét az első éles leckéken érdemes megnézni.
- A szereplők jelenetről jelenetre szöveges leírásból egyeznek (nincs közös referenciakép) — ruházat, részletek eltérhetnek.
- A média az adatbázisban él; nagy mennyiségnél (sok száz lecke) külön tárhelyre kell költöztetni.

## Visszavonás

`LESSON_CLIPS=0` → azonnali kikapcsolás. Végleges: a változtatás visszavonása és a `lesson_clips`, `lesson_clip_media` táblák eldobása
(a leckék tartalma nem függ tőlük).
