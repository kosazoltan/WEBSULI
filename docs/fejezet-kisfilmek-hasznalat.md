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
→ jelenetenként kezdőkép (képmodell + minőségkapu: szöveg / nem gyerekbarát / nem a jelenet → újrapróba) → hang (ElevenLabs; hangkapu:
minden mondatot egy független beszédfelismerő visszaír, betűre összeveti, eltérésnél újragyártja) →
mozgókép a kezdőképből (Seedance 2.0 Mini, 480p; a Seedance 1.5-öt az OpenRouter 2026-11-22-re megszüntette) → átkódolás kicsire (`ffmpeg`) → tárolás. Mért idő: kb. 2–2,5 perc fejezetenként (a Seedance 1.5-tel mérve; a 2.0 Mini 480p-vel még nem mérve — UNVERIFIED); egyszerre
egy fejezet és egy átkódolás készül, és 320 MB szervermemória fölött a kör (vagy a következő fejezet) kimarad (az 512 MB-os példány védelme). A lecke szövege érintetlen: a kisfilm a `lesson_clips`, a média a `lesson_clip_media` táblában él.

## Kapcsolók (Render → `websuli-api-eu` → Environment)

| Változó | Hatás |
|---|---|
| *(semmi)* | Nem gyárt, nem költ; a már kész kisfilmeket kiszolgálja. |
| `LESSON_CLIPS_AUTO=on` | A legfeljebb 3 napja közzétett leckékhez gyárt. Kell hozzá az `OPENROUTER_API_KEY` (megvan). |
| `ELEVENLABS_API_KEY` | A mesélőhang. Nélküle a kisfilm a felolvasás tartalék (gépies) hangjával szól. |
| `OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` | A jóváhagyott próba képmodellje ÉS a hangkapu független felismerője. Nélküle a leckeborító képmodellje rajzol, a hangot pedig az ElevenLabs saját (elnézőbb) felismerője ellenőrzi. |
| `LESSON_CLIP_VIDEO_MODEL` | A mozgókép-modell `szolgáltató/név` alakban (alap: `bytedance/seedance-2.0-mini`). Modellmegszűnéskor (napló: „No endpoints found for …”) ezt kell átírni; érvénytelen érték → alapérték. |
| `LESSON_CLIP_VIDEO_RESOLUTION` | `480p` (alap) vagy `720p`. Mérve 5 mp-re: 480p 0,177 USD, 720p 0,381 USD; a lejátszó 960 px-es képén szemre azonos. |
| `LESSON_CLIP_DAILY_LIMIT` | Naponta legfeljebb ennyi lecke kap gyártást (alap: 2). |
| `LESSON_CLIP_MEDIA_MAX_MB` | A médiatábla mérethatára (alap: 400 MB); fölötte a gyártás megáll, a naplóban jelzi. |
| `FFMPEG_PATH` | Az `ffmpeg` helye, ha nincs a PATH-on. `ffmpeg` nélkül a kisfilmek állóképesek (a naplóban jelzi). |
| `LESSON_CLIPS=0` | Vészfék: nem gyárt, és a leckékben nem jelenik meg kisfilm. |

## Élesítés lépései

0. **Előfeltétel (a `LESSON_CLIPS_AUTO=on` ELŐTT, vak kör L10):** a tulajdonos írásban jóváhagyja és itt rögzíti a kikapcsolási
   feltételt: a mért metrikát (a Render-példány memóriája, nem a Node RSS-e), az egységet (MB), a küszöböt, mi számít tartósnak, és
   hogy ki kapcsol vissza `off`-ra. Jóváhagyás nélkül a gyártás NEM kapcsolható be. Két külön határ van:
   - **automatikus memóriaőr** (a kódban, `CLIP_RSS_LIMIT_BYTES` = 320 MiB, a Node-folyamat RSS-e, az ffmpeg-gyerek nélkül): e fölött
     a kör, a következő fejezet és az átkódolás kimarad — ez nem állítja le a már futó lépést;
   - **kézi kikapcsolási küszöb** (a Render memóriamérése, a gyerekfolyamatokkal együtt): a javaslat 480 MB — **jóváhagyásra vár**.
1. A PR összevonása és telepítése (a `0039` migráció magától lefut).
2. Render Environment: `ELEVENLABS_API_KEY` (megvan), majd — csak a 0. pont jóváhagyása után — `LESSON_CLIPS_AUTO=on`.
3. Egy új lecke közzététele után a Render-naplóban `[lesson-clips]` sorok: fejezetenként „kész: … N kép, N hang, N mozgókép, … kB”.
   Ha „nincs ffmpeg a szerveren” sor jelenik meg, a kisfilmek állóképesek — ekkor szólni kell.
4. A lecke megnyitása: a gombok megjelennek, ahogy a fejezetek elkészülnek.
5. Kikapcsolási feltétel (PR #418): a bekapcsolás utáni első körben a Render memória- és eseménymérését figyelni kell. Ha a példány
   újraindul, vagy a memória tartósan a 0. pontban jóváhagyott küszöböt (javaslat: 480 MB, az 512 MB-os korlát közele) súrolja, azonnal `LESSON_CLIPS_AUTO=off`, és szólni
   kell. A „memóriaőr miatt megállt” naplósor önmagában nem ok a kikapcsolásra: az a védelem működése.
6. **Az első éles kör mérése — kötelező (tulajdonosi döntés, 2026-11-21: „Mérés az első éles körben (Javasolt)”).** A kód a már elindult
   átkódolást memória miatt nem állítja le, ezért az első kör teljes ideje alatt a Render memóriamérését (a példány teljes
   használata, a gyerekfolyamatokkal együtt) figyelni és a csúcsot rögzíteni kell. Ha a csúcs **450 MB fölé** megy: azonnal
   `LESSON_CLIPS_AUTO=off`, a mért csúcs és időpont a PR-ba / a kanbanra, és a futás közbeni memóriafigyelő külön PR-ban készül el,
   mielőtt a gyártás újra bekapcsol. 450 MB alatt a gyártás maradhat, a mért csúcsot akkor is rögzíteni kell.

## Költség és méret (mérve 2026-11-10, két automatikus fejezeten)

- Mozgókép (Seedance 2.0 Mini, 480p, mérve 2026-11-22): kb. 0,035 USD / mp → 4 jelenet 5–7 mp-es klipekkel kb. 0,70–1,00 USD
  fejezetenként (720p-ben kb. kétszer ennyi). A régi Seedance 1.5 kb. 0,026 USD / mp volt. Kép: kb. 0,01 USD / db.
  Hang: 0,5 kredit / karakter (fejezetenként kb. 150–250 kredit). Szöveg- és képkapu-hívások: fillérek.
- Tárolt méret: kb. 3,3 MB fejezetenként (a Seedance 1.5 / 720p nyers klipjei 4–7 MB-osak voltak, átkódolva 0,3–0,7 MB; a 2.0 Mini 480p-vel még nem mérve; a hang 128 kbit/s).
- Egy 12 fejezetes lecke: kb. 9–13 USD és kb. 40 MB.

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
