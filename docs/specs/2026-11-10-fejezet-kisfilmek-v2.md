# Spec: Fejezet-kisfilmek v2 — korosztályos, rajzolt képsor + pontos ábrák + természetes hang

> Dátum: 2026-11-10 · Szerző: Claude Code · Állapot: JÓVÁHAGYVA az irány (tulajdonosi válaszok 2026-11-10), a P0 próba után tulajdonosi szemle
> Előzmény: `docs/specs/2026-11-10-fejezet-kisfilmek.md` (v1). Végrehajtás: `docs/specs/2026-11-10-fejezet-kisfilmek-v2-vegrehajtas.md`

## 0. Miért kell v2 (tulajdonosi visszajelzés 2026-11-10: „borzasztó”)

A v1 kézi próbája (Dinamika, 1. fejezet) megbukott. A mért okok:

1. **Nem rajzfilm, hanem animált dia:** emojik és feliratkártyák; a kép nem azt mutatja, amiről a mondat szól.
2. **Gépies hang:** a felolvasás tartalék hangvégpontja mesélésre alkalmatlan.
3. **Egy figura minden korosztálynak:** bagolyszerű kabala a 9. osztályos fizikában — szembemegy a repo saját képi szabályával
   (`server/lesson-covers.ts` `COVER_STYLE.band`: 6. évfolyamtól „no cartoon characters”).
4. **Felmondott tankönyvszöveg**, nem helyzet vagy történet.

Tulajdonosi döntések (2026-11-10): (a) kép: **MI-rajzolt háttér és szereplők + programból rajzolt pontos ábrák**; (b) hang:
**új, természetes neurális hang**; (c) próba: **két korosztályon**; (d) a kisfilm figurái, megjelenése és mondanivalója
**korosztályonként más**, ahogy a tananyag képi és színvilága.

## 1. Cél

Fejezetenként rövid (kb. 30–45 mp) kisfilm, amely **egy helyzetet játszik el** a fejezet lényegéről: 3–4 rajzolt kép lassú
kameramozgással, rajtuk pontos, programból rajzolt ábra (képlet, lépések, szembeállítás, grafikon, erőnyilak, a fejezet saját
ábrája), természetes magyar mesélőhanggal. A figura, a képi stílus, a hangnem, a mondathossz és a tempó az évfolyamsávhoz
igazodik. A v1-ből megmarad: külön tábla, kiszolgálás, „készülnek” jelzés, háttérgyártás kapcsolóval, vészfék, gombok helye.

## 2. NEM cél

- Generált videó (Veo és társai), MP4-kódolás a szerveren.
- A lecke `json`-jának módosítása.
- A régi katalógus visszamenőleges feltöltése.
- A P0 próbában: éles adatírás, telepítés, a háttérgyártás átírása (az a P1–P2).

## 3. Új nézőpont: forgatókönyv három rétegben

| Réteg | Mi | Ki állítja elő |
|---|---|---|
| **Helyzet** | 3–4 „beállítás” (shot): egy konkrét, a fejezet szövegéből vett helyzet képei (pl. a futó a rajtnál → fut a kanyarban → visszaér a rajtvonalra) | képmodell, sávstílussal; szöveg, szám, betű a képen TILOS (a borítókép minőségkapujával) |
| **Pontos ábra** | a képre úszó, programból rajzolt elem: képlet darabonként, lépések, szembeállítás, grafikon, erőnyilak, vagy a fejezet saját `animate` blokkja | a lejátszó (adatból) — minden szám és jelölés itt jelenik meg, soha a rajzon |
| **Mesélés** | jelenetenként 1–2 mondat, a sáv hangnemében | hangmodell, sávonkénti hanggal és hangnem-utasítással |

Mayer-elvek: a kép és a hang ugyanarról szól (koherencia), a szám az ábrán jelenik meg, amikor elhangzik (jelzés), a felirat
kikapcsolható (redundancia), fejezetenként egy gondolatmenet (szegmentálás).

## 4. Korosztályos profil — `shared/clip-style.ts` (a `designThemeForClassroom` sávjai)

| Sáv (évf.) | Figura | Képi stílus | Ábra- és keretstílus | Mesélés | Hang |
|---|---|---|---|---|---|
| explorer (1–2.) | állandó mesefigura: **Bodza, a kíváncsi sün** — minden képen | lágy, kerek mesekönyv, menta és napsárga | nagy, kerek, vastag körvonal; legfeljebb 1 ábraelem egyszerre | 3 jelenet, ≤ 90 karakter / jelenet, egy gondolat; megszólít, kérdez; nincs szakszó magyarázat nélkül | meleg, lassú, mesélő |
| adventure (3–5.) | **két gyerek felfedező** (Zsófi és Marci) hátizsákkal — a képeken | festett kalandillusztráció, homok–barack–türkiz | kerek sarkok, kézzel rajzolt hatású vonal | 3–4 jelenet, ≤ 130 karakter; „gyere, nézzük meg”; kihívás → megfigyelés → szabály | élénk, barátságos |
| studio (6–8., 0) | nincs kabala; kortárs kamaszok hétköznapi helyzetben, arc közelről nem | félrealisztikus, indigó–lila–türkiz | tiszta vonal, visszafogott mozgás | 4 jelenet, ≤ 170 karakter; „miért van ez így?”; nem gyerekes, nem kioktató | természetes, fiatalos |
| laboratory (9–10.) | **nincs figura**; a jelenség a főszereplő (ember legfeljebb távolról / hátulról) | éles, valósághű, hideg kék és grafit | mérnöki: vékony vonal, rács, mértékegységek | 4 jelenet, ≤ 200 karakter; jelenség → törvény → számolás; tárgyszerű, pontos | nyugodt, felnőttes |
| future (11–12.) | nincs figura; emberek csak távolról | filmszerű, mélykék, meleg ellenfény | minimalista, sötét alapon világos | 4 jelenet, ≤ 220 karakter; összefüggés, alkalmazás, vizsgahelyzet | felnőtt, dokumentumfilmes |

A profil egyetlen adatszerkezet: `imageStyle` (angol stílusmondat a képmodellnek), `cast` (a figura szó szerinti, minden
képbriefbe bemásolt leírása vagy `null`), `narration` (jelenetszám, karakterplafon, hangnem-szabályok a forgatókönyvíró
modellnek), `voice` (hangazonosító + hangnem-utasítás + sebesség), `look` (a lejátszó CSS-változói: keret, sarok, betű, ábraszín).

## 5. Adatszerződés v2 — `shared/lesson-clip.ts`

```
Clip2  = { v: 2, band, title, shots: Shot[2..4], scenes: Scene2[3..5] }
Shot   = { image: mediaId, alt: string(≤160) }                       // rajzolt kép (16:9, webp)
Scene2 = { say, audio?: mediaId, ms?: int, shot: index, camera: "in"|"out"|"left"|"right"|"still", overlay?: Overlay }
Overlay= { kind: "title", text }
       | { kind: "formula", parts[{t, note?}](1..4), caption? }
       | { kind: "steps", items[{text}](2..4) }
       | { kind: "compare", left{label}, right{label}, verdict? }
       | { kind: "graph", xLabel, yLabel, points[[x,y]](2..8), unitX?, unitY? }
       | { kind: "vectors", body: string(≤24), arrows[{dir: "left"|"right"|"up"|"down", label(≤24), size: 1..3}](1..4) }
       | { kind: "lessonVisual", blockIndex }                         // a fejezet saját animate blokkja
mediaId = /^[a-f0-9]{32}$/                                            // a tartalom sha256-jának eleje
```

A `v: 1` kisfilmek kiszolgálása megszűnik (a v1 sablonok és a v1 kézi kisfilmek törlődnek a P1-ben); a P0 próba idejére a v1 kód
érintetlen marad, a v2 lejátszó mellette él.

## 6. Média — tárolás és kiszolgálás (P1)

Új tábla `lesson_clip_media (id char(32) PK, kind 'image'|'audio', mime, bytes bytea, created_at)`; kiszolgálás
`GET /api/lesson-clips/media/:id` — tartalomcímzett, ezért `Cache-Control: public, max-age=31536000, immutable`, a Vercel
`/api/*` no-store szabályából kivéve (a `tts/audio` mintájára), tartománykérés (206) a hangra. A CSP változatlan (azonos eredet).

## 7. Gyártás (P1–P2) — fejezetenként

1. **Forgatókönyv** (szövegmodell, sávprofil a promptban): helyzet, beállítások angol képbriefje, jelenetek, ábrák. Kapuk: séma,
   számhűség (a v1 kapuja), sáv szerinti karakterplafon, a `lessonVisual` létező blokkra mutat.
2. **Képek** (képmodell): beállításonként egy 16:9 kép = brief + `cast` + `imageStyle` + közös tiltások; minőségkapu (szöveg /
   nem biztonságos / nem a jelenet → egy újrapróba), ahogy a leckeborítónál.
3. **Hang** (hangmodell): jelenetenként egy fájl a sáv hangjával és hangnem-utasításával; a hossz (`ms`) a fájlból.
4. Tárolás, kiszolgálás; a megnyitott lecke a v1 szerinti lekérdezéssel kapja meg.

Szolgáltató: a P0 próba dönti el. Alapjelölt az OpenAI (a szerveren már van kulcsa: `AI_INTEGRATIONS_OPENAI_API_KEY` /
`OPENAI_API_KEY`): kép `POST /v1/images/generations` (`gpt-image-2.5-flare`, `1536x864`, `webp` — a hivatalos referencia szerint,
2026-11-10), hang `POST /v1/audio/speech` (hangnem-utasítással vezérelhető modell — a pontos modellnév és a magyar minőség
UNVERIFIED, a P0 méri). Ha a magyar hang nem elég jó: Azure `hu-HU` neurális hang vagy ElevenLabs (új kulcs kell).

Költségbecslés (UNVERIFIED, a P0 méri): 3 kép + 4 hang + 1–2 szöveghívás fejezetenként.

## 8. Lejátszó v2 — `client/src/lesson-runtime/clips/`

- A színpad a rajzolt kép (teljes felület), lassú kameramozgás a jelenet hosszára (`ms`), beállításváltáskor áttűnés.
- Az ábra alsó / oldalsó, áttetsző panelen úszik be; darabjai a jelenet idejéhez arányosan jelennek meg.
- Kabala nincs a lejátszóban: a figura a rajzon él (csak ahol a sáv előírja).
- Felirat: alapból be, gombbal kikapcsolható; betűméret a sáv `minBodyPx` értékéből.
- Sávonkénti megjelenés (`data-clip-band`): keret, sarok, betű, ábraszín a profil `look` értékeiből.
- Vezérlés, akadálymentesség, néma tartalék, csökkentett mozgás: mint a v1-ben; a kép `alt` szövege a képernyőolvasónak.

## 9. Fázisok

- **P0 — próba két korosztályon (ez a kör):** sávprofil, v2 séma, v2 lejátszó; két kézzel írt kisfilm valódi rajzolt képekkel és
  neurális hanggal — „Felszínformák” 4. osztály, 1. fejezet (adventure) és „Dinamika” 9. osztály, 1. fejezet (laboratory) —,
  bemutató felvétel mindkettőről; mért költség és idő. **Tulajdonosi szemle:** kép, hang, hangnem.
- **P1 — tárolás és kiszolgálás:** `lesson_clip_media`, médiavégpont, a v1 sablonok és kézi kisfilmek kivezetése.
- **P2 — háttérgyártás:** a 7. pont csővezetéke kapcsolóval, napi plafonnal; élő mérés egy új leckén.

## 9b. A P0 mérése (2026-11-10)

Két kézi kisfilm készült el a tervezett módon (a média a munkamenet ideiglenes mappájában él, a repóba nem került):

| | Felszínformák 4. o. (adventure) | Dinamika 9. o. (laboratory) |
|---|---|---|
| Beállítás / jelenet | 3 kép / 4 jelenet | 3 kép / 4 jelenet |
| Elmondott szöveg | 329 karakter | 564 karakter |
| A kisfilm hossza (hangfájlokból) | 29,4 mp | 56,6 mp |
| Ábrák | cím, lépések ×2, szembeállítás | cím, a fejezet saját pálya–elmozdulás ábrája, szembeállítás, képlet |

- **Gyártási idő:** a két fejezet 14 hívása (6 kép + 8 hang) párhuzamosan 13,2 mp alatt készült el; egy kép 10,9–13,2 mp, egy hang 2,8–4,7 mp.
- **Modellek (a kulccsal lekérdezve):** kép `gpt-image-2.5-flare` (`1536x864`, `quality: medium`, `webp`), hang `gpt-4o-mini-tts`
  (sávonkénti hang + hangnem-utasítás + sebesség). A magyar hang tehát elérhető; a MINŐSÉGÉT fül dönti el (tulajdonosi szemle).
- **Költség:** egy kép a válasz szerint 280 kimeneti képtoken; a hivatalos díjtáblával (30 USD / 1M kimeneti képtoken) ez kb.
  0,0084 USD / kép, azaz kb. 0,025 USD / fejezet a képekre. A hang díja UNVERIFIED (a díjtáblát nem ellenőriztem).
- **Kép:** mind a hat kép szöveg nélküli; a két gyerek mindhárom képen felismerhetően ugyanaz (csak szöveges leírásból, referenciakép
  nélkül); a 9. osztályos képeken nincs figura, a futó csak hátulról / távolról látszik.
- **Lejátszó:** mindkét kisfilm végigment a valódi leckében (hangmód `mp3`, lapméretű túlcsordulás és levágás nélkül, oldalhiba nélkül).
- **Tanulság:** a 9. osztályos kisfilm a tervezett 30–45 mp-nél hosszabb (négy, plafon közeli mondat + nyugodt hang) → a P2-ben
  a laboratory / future sávban a kisfilm összes szövege legfeljebb 450 karakter legyen.

## 9c. Mozgóképes próba (2026-11-10, tulajdonosi kérés: dinamikusabb kép, jobb hang)

- **Videómodellek mérése** (OpenRouter `POST /api/v1/videos`, kezdőképből, 720p, 4–5 mp; a díj a válasz `usage.cost` mezője):
  `tbc/mischief-1` 0,05 USD / 16 mp gyártás (a tárgyak menet közben átalakulnak), `x-ai/grok-imagine-video-1.5-lite` 0,16 / 28 mp,
  `google/veo-3.1-lite` 0,12 / 34–47 mp (stabil, de kevés mozgás), **`bytedance/seedance-1-5-pro` 0,13 / 54 mp (a kockák alapján a
  legjobb arány)**, `bytedance/seedance-2.0-mini` 0,38 / 94–103 mp, `alibaba/wan-2.6` 0,50 / 66 mp.
- **Hang:** ElevenLabs `eleven_flash_v2_5` (0,5 kredit / karakter, 0,5 mp / jelenet) a fiók magyar hangjaival: 3–5. évfolyam „Vera”,
  9–10. évfolyam „Magyar Férfi”. A hangminőség megítélése tulajdonosi szemle.
- **A két próbafejezet teljes újragyártása** (minden jelenet Seedance 1.5-tel mozog, jelenetenként a hang hosszához igazított klip):
  4. osztály 22 mp / 0,55 USD, 9. osztály 41 mp / 1,04 USD; a két fejezet 6,7 perc alatt készült el (a klip díja kb. 0,026 USD / mp).
- **Tanulság:** a szereplő csak akkor marad meg, ha a klip kezdőképén rajta van — az előző klip utolsó kockájáról indított jelenetben
  a modell más gyerekeket rajzolt (újragyártva az eredeti kezdőképből). A P2-ben minden jelenet saját, szereplős kezdőképből induljon.
- **Tulajdonosi irány:** minden korosztály rajzfilmszerű legyen (ne fotószerű) → a `laboratory` / `future` sáv `imageStyle` értékét a
  P1-ben stilizált 2D-re kell írni (a próba 9. osztályos képei már így készültek, a profil még nem).
- **Kód:** a v2 jelenet opcionális `video` médiaazonosítót kap; a lejátszó némított videót játszik a kép fölött, hibánál a kép marad.

## 9d. P1–P2 megépítve; élő próba a valódi gyártósorral (2026-11-10)

Végrehajtás: `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md`. Tulajdonosi szemle: a videók, a tartalom és Vera hangja
rendben; a férfihang Csaba. A `source/scripts/clip-trial.ts` a VALÓDI gyártósort futtatta két fejezetre (éles adat írása nélkül):

| | Felszínformák 4. o., „A síkság” | Dinamika 9. o., „Egyenes vonalú egyenletes mozgás” |
|---|---|---|
| Teljes gyártási idő | 85,0 mp | 87,3 mp |
| Forgatókönyv | 1 hívás (10,7 mp) | 2 hívás (javítókör; 12,1 mp a hosszabb) |
| Kép / képkapu | 4 / 4, újrapróba nélkül | 4 / 4, újrapróba nélkül |
| Hang (ElevenLabs flash, 32 kbit/s) | 4 db, együtt 87 kB | 4 db, együtt 102 kB |
| Mozgókép nyersen → átkódolva | 5,0–6,5 MB → 0,33–0,37 MB | 3,8–6,9 MB → 0,29–0,41 MB |
| Tárolt média összesen | 1,81 MB | 1,62 MB |
| A kisfilm hossza | 24 mp | 27 mp |
| Ábrák | cím, lépések, képlet, a fejezet számegyenese | cím, képlet, a fejezet számegyenese, képlet |

Mindkét kisfilm végigment a lejátszóban a valódi leckében (hangmód `mp3`, a mozgókép 960 px széles, az ábrapanel a színpadon belül,
oldalhiba nélkül). A leghosszabb lépés a mozgókép (55–60 mp jelenetenként, párhuzamosan). A számhűség-kapu a 9. osztályos
forgatókönyv első változatát visszadobta, a javítókör után átment.

NEM igazolt (élesben derül ki): van-e `ffmpeg` a Render-példányon (nélküle állóképes kisfilm készül, a napló jelzi); a szerveren lévő
OpenAI-kulccsal megy-e a képgyártás (ha nem, a leckeborító képmodellje rajzol); a `dbClipStore` éles adatbázison (helyi Postgres 16-on
igazolva).

## 9e. Hangminőség: mért hibák és a hangkapu (2026-11-10, tulajdonosi szemle: „Vera hangja nem jó”)

A tulajdonos az első automatikus Vera-kisfilmet hibásnak hallotta. A mérés (független beszédfelismerő, `gpt-4o-transcribe`; a korábban
jóváhagyott Vera-hangokat hibátlanul, a rosszakat rosszul írja vissza) négy saját hibát tárt fel:

| Hiba | Mérés | Javítás |
|---|---|---|
| Vera a `eleven_flash_v2_5` modellel félreolvas | 12 felolvasásból 4 betűre pontos („síkság” → „síkség”, „A kisebb vízszintes”) | Vera hangmodellje `eleven_v4` (10/12, a maradék 1 betű); Csaba marad flash (12/12) |
| Nincs ellenőrzés a kész hangon | a gyártósor a hibás hangot kiadta | hangkapu: minden mondat visszaírva, betűre összevetve, legfeljebb 3 próbálkozás, a legpontosabb marad |
| Az ElevenLabs saját felismerője elnéző a saját hangjával | egy érthetetlen mondatot hibátlannak írt vissza | a kapu felismerője független (OpenAI), az ElevenLabsé csak tartalék |
| A hang 22 kHz / 32 kbit/s volt (a jóváhagyott 44,1 kHz / 128 kbit/s helyett) | tárhelykímélés miatt állítottam át | vissza a jóváhagyott minőségre (`mp3_44100_128`) |

További, ugyanekkor mért hibák: a hang hosszát az első MP3-keret bitrátájából számoltam (a valódi 58%-a lett → rövid mozgókép) — most
keretszámlálás (a valódi fájlokon ≤ 30 ms eltérés); az előfizetés 3 egyidejű ElevenLabs-kérést enged (a 4. HTTP 429) — a hangkérések
közös sorban, egyszerre 2; a forgatókönyvíró elgépelte a kiírt számot („Százthúsz”) — a számjegyeket a program olvassa ki
(`shared/hu-numbers.ts`), a felirat a számjegyest mutatja; a 2500 tokenes válaszkeret a 9. osztályos forgatókönyvet csonkolta — 5000.

Eredmény a javított gyártósorral (két új fejezet): mind a 8 mondat hangja két felismerővel (OpenAI, ElevenLabs) betűre egyezik; a
4. osztályos fejezetnél a kapu egy mondatot újragyártatott. Gyártási idő 134–143 mp, tárolt média 3,3 MB fejezetenként (a jobb
hangminőség miatt több, mint a 9d mérésben).

## 10. Edge case-ek

- A képmodell szöveget rajzol a képre → minőségkapu, újrapróba; kétszeres bukásnál a jelenet képe a sáv semleges háttere.
- A figura képről képre eltér → a `cast` szó szerinti leírása minden briefben; a P0 méri, elég-e (ha nem: referencia-kép).
- A hang hibásan ejt képletet vagy rövidítést → a `say`-ben minden jelölés szavakkal (a v1 szabálya), a jelölés az ábrán.
- Hang nélkül: néma időzítő + felirat (v1). Kép nélkül: sávszínű háttér, az ábra és a hang megy.
- A fejezetnek nincs `animate` blokkja → `lessonVisual` nem használható (kapu).
- 6. évfolyamtól a képen felismerhető arc, márka, szöveg tilos (a borító szabályai).

## 11. Elfogadás (EARS) — P0

- WHEN a két próba-kisfilm lejátszódik THEN a kép a mondat helyzetét SHALL mutatni, a szám és a képlet csak a programból rajzolt ábrán SHALL megjelenni.
- WHEN a két próbát egymás mellé tesszük THEN a figura, a képi stílus, az ábrastílus, a mondathossz és a hang hallhatóan / láthatóan SHALL eltérni a 4. és a 9. osztály között.
- WHEN a kisfilm fut THEN a jelenet a hang végén SHALL váltani, a felirat ki-be kapcsolható SHALL lenni.
- The v2 lejátszó böngészős tesztje (elrendezés 1280 és 390 px, néma tartalék, felirat-kapcsoló) SHALL zöld lenni; a v1 tesztek SHALL zöldek maradni.
- The P0 SHALL NOT írni éles adatot.

## 12. Kockázatok / visszavonás

- A magyar neurális hang minősége szolgáltatónként eltér — a P0 valódi mintával dönt, nem becsléssel (csapda C-28/4).
- Költség: a kép a drága tétel; a sávprofil a képszámot 2–4-re korlátozza, a napi plafon marad.
- Gyerekeknek szánt MI-kép: tiltólista + minőségkapu; a figura leírása rögzített.
- Visszavonás: a v2 a P0-ban csak próbaoldalon él; élesben a `LESSON_CLIPS=0` vészfék változatlan.
