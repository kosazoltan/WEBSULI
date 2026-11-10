# Spec: Fejezetenkénti rajzfilmes kisfilmek a leckékben

> Dátum: 2026-11-10 · Szerző: Claude Code (tulajdonosi kérésre) · Állapot: JÓVÁHAGYVA (a tulajdonos a munkát kérte; `docs/agent-haromfazisu-munka.md`)
> Végrehajtás: `docs/specs/2026-11-10-fejezet-kisfilmek-vegrehajtas.md`

## 1. Cél

Minden Stúdió-lecke minden fejezetéhez (a Célkártya és a nyitómese kivételével) készüljön egy rövid, azonos stílusú, hangos
rajzfilmes magyarázó kisfilm, amely nem élethű, hanem a megértést segíti. A kisfilm a fejezetcím melletti lejátszógombbal
indul; a lecke tetején egy gomb az összes fejezet kisfilmjét egymás után játssza le (a teljes lecke legfeljebb kb. 5 perc).
A tananyagkészítő a leckét a szokott módon közzéteszi, a kisfilmek utána háttérfolyamatban készülnek, és amint megvannak,
a megnyitott leckében is megjelennek. Próbaként a legutóbb elkészült lecke (Dinamika – összefoglaló a 9. osztályos
fizikához, `1f04037f-bb51-4929-940e-366337ec04b8`) kézzel írt kisfilmeket kap.

## 2. NEM cél (out of scope)

- MP4 / videófájl kódolása, generatív videómodell (Veo, Kling), Manim / Remotion / ffmpeg a szerveren.
- Új hangszolgáltató vagy új titok: a hang a meglévő `GET /api/tts/audio` végpontról jön.
- A lecke `json`-jának módosítása: a kisfilm külön táblában él, a `lessons.json` bájtra változatlan (a forráshűségi,
  javítási és hash-ellenőrzések érintetlenek).
- A régi katalógus visszamenőleges feltöltése (a háttérfolyamat csak a friss leckéket nézi, ld. 4.6).
- A gyártósor (`server/studio/single-run/engine.ts`) módosítása.
- A feltöltött, régi HTML-anyagok (`/dev/*`).

## 3. Kutatás — hogyan csinálják mások (összefoglaló, forrásokkal)

Webes kutatás 2026-11-10 (a források keresési kivonatok; elsődleges oldalak nagy része a hálózati szabály miatt nem volt
megnyitható — az árak UNVERIFIED, élesítés előtt ellenőrizendők).

| Megközelítés | Példa | Mit tanultunk |
|---|---|---|
| LLM → animációs kód → render | Manim, manim-voiceover, TheoremExplainAgent (https://tiger-ai-lab.github.io/TheoremExplainAgent), Code2Video (https://github.com/xxx-lang/Code2Video), Generative Manim | Python + LaTeX + ffmpeg konténer, percekig tartó render, ~6%+ hibás futás, javítókör kell; a kis Render-példányon nem életszerű. |
| Programozott JS-videó | Remotion (licenc: 3 fő fölött fizetős, https://www.remotion.dev/docs/license/faq), Motion Canvas, Revideo | A böngészős lejátszó (Player) szerveroldali render nélkül megy; a jelenet adat, nem videófájl. |
| Dia + hang | NotebookLM Video Overview, Paper2Video, MoneyPrinterTurbo | Narrált diák; a stock-videós változatnál a kép nem a tartalomból jön (didaktikailag gyenge). |
| Állapotvezérelt vektoranimáció | Duolingo (Rive, https://blog.duolingo.com/world-character-visemes), Brilliant (Rive) | A nagy oktatóplatformok nem videót generálnak: vektoros jelenet + a hang időzítése. Kicsi, éles, egységes stílus. |
| Generatív videó | Veo 3.1 (kb. 0,05–0,40 USD/mp, 8 mp-es klipek) | Drága, lassú, a stílus és a feliratok / ábrák nem megbízhatók; a Code2Video mérése szerint a kódalapú jelenet ~30%-kal jobb megértést ad. |

Pedagógia: Guo–Kim–Rubin 2014 (rövid, 6 percnél rövidebb szegmensek; https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf),
Mayer multimédia-elvei (szegmentálás, jelzés, modalitás, koherencia): fejezetenként rövid klip, hang + kevés képernyőszöveg,
az éppen elhangzó elem kiemelve, díszítés nélkül.

**Döntés:** „jelenet-JSON + hangsáv” — a kisfilm zárt sémájú forgatókönyv (jelenetek: elmondott mondat + egy rajzfilmes
képsablon), amelyet a böngésző játszik le a lecke saját SVG/CSS sablonkönyvtárával, a hang jelenetenként a meglévő
`/api/tts/audio` MP3. Nincs render, a gyártás fejezetenként egyetlen modellhívás (másodpercek), a stílus a sablonoktól
garantáltan egységes, a felirat magától adódik. A jelenet hossza = a hangfájl hossza (nem kell szószintű időbélyeg).

## 4. Rögzített döntések és kényszerek

### 4.1 Adatszerződés — `shared/lesson-clip.ts`

```
Clip   = { v: 1, title: string(1..120), scenes: Scene[3..8] }           (strict)
Scene  = { say: string(20..240), visual: Visual }                        (strict)
Visual = { kind: "title",   emoji, text(≤70) }
       | { kind: "idea",    emoji, text(≤110) }
       | { kind: "formula", parts: [{ t(≤28), note?(≤44) }](1..5), caption?(≤110) }
       | { kind: "steps",   items: [{ emoji?, text(≤70) }](2..4) }
       | { kind: "compare", left: { emoji, label(≤44) }, right: { emoji, label(≤44) }, verdict?(≤70) }
       | { kind: "motion",  actor: emoji, effect: "slide"|"fall"|"push"|"bounce"|"orbit"|"grow", caption(≤110) }
emoji  = string(1..8)
```

- `say`: a jelenet elmondott magyar mondata, sima szöveg; ≤ 240 karakter, mert a hangvégpont 300-nál vág
  (`shared/speech-fallback.ts`, `TTS_AUDIO_MAX_CHARS`). Egy kisfilm `say` szövegeinek összege ≤ 900 karakter (kb. 60 mp).
- A hang URL-je a szövegből számolódik (`ttsAudioUrl(say, "hu")`), ezért semmilyen bináris tárolás nem kell.

### 4.2 Tárolás — új tábla `lesson_clips` (migráció `0038_lesson_clips.sql` + Drizzle `shared/schema.ts`)

`id` (uuid), `lesson_id` (FK `lessons.id`, ON DELETE CASCADE), `section_index` (int), `heading` (a fejezetcím a gyártáskor),
`source_hash` (char(64), a fejezet tanítószövegének lenyomata; kézi kisfilmnél NULL), `status` (`ready` | `failed`),
`clip` (jsonb, `failed` sornál NULL), `origin` (`handmade` | `auto`), `model` (varchar, NULL kézinél), `attempts` (int),
`created_at`, `updated_at`. Egyedi: (`lesson_id`, `section_index`). Additív, idempotens; visszaállítás: `DROP TABLE lesson_clips`.

### 4.3 Mi számít fejezetszövegnek

`clipSource(lesson, sectionIndex)`: a fejezet `explain` (szöveg), `example` (feladat, megoldás) és `recap` (pontok) blokkjai;
az 1. fejezetben a Célkártya (`isGoalCardText`) és az azt követő mese-blokk KIMARAD (a `blockLabel` szabálya szerint).
Ha így nem marad legalább 80 karakter tanítószöveg, a fejezet nem kap kisfilmet. `source_hash` = ennek sha256-ja.

### 4.4 Kiszolgálás — `GET /api/lessons/:id/clips`

Válasz: `{ clips: [{ sectionIndex, clip }], pending: boolean }`. Csak publikált leckére; ismeretlen / nem publikált: 404.
Egy sor csak akkor megy ki, ha `status='ready'`, a `clip` ma is megfelel a sémának, a lecke adott indexű fejezetének címe
egyezik a tárolt `heading`-gel, ÉS (`source_hash` NULL vagy egyezik a mostani fejezetszöveggel). `pending`: a háttérgyártás
be van kapcsolva, a lecke a friss ablakban van, és van olyan kisfilmre jogosult fejezet, amelynek még nincs kész vagy
végleg sikertelen sora. `LESSON_CLIPS=0` esetén a válasz mindig `{ clips: [], pending: false }` (vészfék).
A válasz nem gyorsítótárazott (a `/api/*` alapszabálya), GET-en nincs mellékhatás.

### 4.5 Kézi kisfilmek — `server/lesson-clip-seeds.ts`

A repóban élő, sémával ellenőrzött kézi kisfilmek (`lessonId` → fejezetindex → `{ heading, clip }`). A háttérfolyamat minden
körben beírja a hiányzókat (ha a lecke létezik, publikált, és a fejezetcím egyezik); a kézi sor felülírja az automatikusat,
az automatikus a kézit soha. A kézi beírás a gyártási kapcsolótól független (nem kerül pénzbe), csak a vészfék állítja le.

### 4.6 Háttérgyártás — `server/lesson-clips.ts` (a leckeborító-munkás mintájára)

- Indítás: `server/index.ts`, csak `NODE_ENV=production`, nem e2e; első kör 90 mp után, utána 3 percenként; Postgres
  advisory lock (egy példány dolgozik).
- Kapcsolók: `LESSON_CLIPS=0` → minden leáll (vészfék). `LESSON_CLIPS_AUTO=on` + `OPENROUTER_API_KEY` → modellgyártás.
  Alapállapotban (kapcsoló nélkül) csak a kézi kisfilmek íródnak be — az új viselkedés alapból nem költ.
- Mely leckék: publikált, a közzététel óta legfeljebb 3 nap telt el (`CLIP_FRESH_DAYS`), a legfrissebb elöl; naponta legfeljebb
  `LESSON_CLIP_DAILY_LIMIT` (alap 10) lecke kap gyártást (az `origin='auto'` sorok mai, UTC-napi leckeszáma alapján).
- Gyártás: fejezetenként egy hívás (`anthropic/claude-haiku-5.5` az OpenRouteren — ugyanaz, mint a borító képterve),
  egyszerre 3 fejezet párhuzamosan. A válasz első `{…}` blokkja → `clipSchema` + tartalmi kapuk (4.7). Bukásnál egy javító
  hívás a hibalistával; ha az is bukik: `failed` sor, `attempts` nő. Egy fejezet összesen legfeljebb 2 körben próbálható
  (`attempts < 2`), utána végleg sikertelen (a `pending` nem tartja fenn a lekérdezést).
- A lecke `json`-jához a munkás nem ír, csak olvas.

### 4.7 Tartalmi kapuk az automatikus kisfilmre (forráshűség)

- séma (4.1) + a `say` összhossz ≤ 900;
- az első jelenet `title` fajtájú;
- számhűség: a `say` és a képernyőszövegek minden számjegysorozata (pl. `400`, `9,8`) szerepel a fejezet forrásszövegében
  vagy a fejezetcímben — új számadat nem születhet;
- tiltott tartalom: URL, HTML-jel (`<`, `>`), markdown-jel (`**`, `` ` ``) a szövegekben.

### 4.8 Lejátszó — `client/src/lesson-runtime/clips/`

- `useLessonClips(lessonId)`: lekéri a 4.4 végpontot; amíg `pending`, 20 mp-enként újra (legfeljebb 30 percig); hiba esetén
  némán üres (a lecke kisfilm nélkül is teljes).
- Fejezetcím melletti gomb (`data-testid="clip-play-<index>"`, „Kisfilm”): csak akkor látszik, ha a fejezethez van kész
  kisfilm. A lecke tetején (a tananyag-panel fejében) „Kisfilmek lejátszása” gomb, ha legalább egy kisfilm kész; amíg
  `pending`, mellette „készülnek a kisfilmek…” jelzés.
- `ClipPlayer` (modális, `role="dialog"`, Esc / Bezárás, fókusz a párbeszédre): rajzolt „színpad” (16:9), a narrátor-kabala
  (SVG, pislog, hang közben mozog a szája), a jelenet képsablonja, alul felirat (a `say`), jelenetpöttyök, vezérlők:
  lejátszás / szünet, előző / következő jelenet, újra. Lejátszási listánál a fejezetek egymás után mennek.
- Hang: egyetlen hangelem, amelyet a gombnyomás kezelője indít el (iOS Safari), jelenetenként `ttsAudioUrl(say,"hu")` forrással,
  1,1-szeres sebességgel; a jelenet a hang `ended` eseményére lép. Ha a hang hibát ad
  vagy nem indul: a böngésző beszédmotorja (`speakText`); ha az sincs: néma időzítő (`max(2500, say.length × 65)` ms) —
  a felirat miatt a kisfilm hang nélkül is végignézhető. Bezáráskor, fülváltáskor minden hang leáll.
- Csökkentett mozgás (`prefers-reduced-motion`): a jelenet állóképként jelenik meg, a hang és a felirat marad.
- CSP: csak azonos eredetű hang (`/api/tts/audio`), nincs `blob:` / `data:` / külső forrás; a mozgás CSS-osztály és
  kulcskocka (a `/lesson/*` CSP `style-src 'self' 'unsafe-inline'` mellett megengedett).

## 5. Edge case-ek

- A lecke kisfilm nélkül: nincs gomb, nincs jelzés, a lecke változatlan (régi anyag, névtelen látogató, próbanézet `lessonId` nélkül).
- A leckét javítják (új tartalom, ugyanaz a sor): a `heading` / `source_hash` eltér → a régi kisfilm nem megy ki; a friss
  ablakban lévő leckénél az automatikus gyártás az eltérő lenyomatú sort újragyártja.
- A fejezetek száma csökken: a túlnyúló indexű sor nem megy ki.
- A hangvégpont korlátja (600 kérés / 15 perc / IP): egy 12 fejezetes lecke teljes lejátszása kb. 60 kérés; CDN-gyorsítótár.
- Hálózat nélkül / hanghiba: néma időzítő + felirat.
- Két szerverpéldány: advisory lock; a beírás `ON CONFLICT (lesson_id, section_index)` — kézi sort automatikus nem ír felül.
- A modell hibás JSON-t ad: javítókör, majd `failed`; a többi fejezet ettől függetlenül elkészül.
- Tárolt, de a sémának már nem megfelelő kisfilm (sémaváltozás után): a kiszolgálás kihagyja.
- e2e-mód és nem éles futás: a munkás nem indul.

## 6. Elfogadási kritériumok (EARS)

- E1 WHEN egy publikált lecke fejezetéhez kész kisfilm van THEN a lejátszó a fejezetcím mellett „Kisfilm” gombot SHALL mutatni, és arra a kisfilm elindul.
- E2 WHEN a leckéhez nincs kisfilm és nincs folyamatban THEN a lejátszó sem gombot, sem jelzést SHALL NOT mutatni.
- E3 WHEN a kisfilm fut THEN a jelenetek a hang végén maguktól SHALL váltani, a felirat az éppen elhangzó mondatot SHALL mutatni.
- E4 WHEN a hang nem játszható le THEN a kisfilm néma időzítővel, felirattal végig SHALL menni.
- E5 WHEN a „Kisfilmek lejátszása” gombot megnyomják THEN a kész kisfilmek fejezetsorrendben, egymás után SHALL lejátszódni.
- E6 WHEN `pending` igaz THEN a kliens újra SHALL kérdezni, és az időközben elkészült kisfilm gombja újratöltés nélkül SHALL megjelenni.
- E7 WHEN a háttérfolyamat fut THEN a kézi kisfilmeket (4.5) be SHALL írni, ha a lecke publikált és a fejezetcím egyezik; eltérésnél SHALL NOT.
- E8 WHEN `LESSON_CLIPS_AUTO=on` és van kulcs THEN a friss leckék kisfilm nélküli fejezeteihez a munkás kisfilmet SHALL gyártani, a Célkártya és a mese szövege nélkül.
- E9 WHEN a modell válasza megsérti a sémát vagy a 4.7 kapukat THEN a sor `failed` SHALL lenni, és a végpont SHALL NOT kiadni.
- E10 WHEN `LESSON_CLIPS=0` THEN a munkás nem indul, és a végpont üres listát SHALL adni.
- E11 WHEN a fejezet címe vagy szövege a gyártás óta változott THEN a régi kisfilm SHALL NOT kimenni.
- E12 The system SHALL NOT módosítani a `lessons.json` tartalmát a kisfilmek miatt.

## 7. Tesztterv

- `tests/lesson-clip.test.ts`: séma (határok), `clipSource` (Célkártya + mese kihagyása), lenyomat, tartalmi kapuk (számhűség, tiltott jelek), a néma időzítő képlete.
- Ugyanott: minden kézi kisfilm megfelel a sémának; a Dinamika-lecke 12 fejezete megvan; a migráció és a Drizzle-séma oszlopai egyeznek.
- `tests/lesson-clip-worker.test.ts`: memóriabeli tárral — kézi beírás (E7), gyártás + javítókör + `failed` (E8, E9), napi plafon, friss ablak, kézi sor védelme, kapcsolók (E10), a kiszolgálási szűrő (E11, `pending`).
- `tests/lesson-clips.spec.ts` (Playwright, `playwright.lesson-clips.config.ts`): a próbaoldalon (`/__lesson-runtime-probe?clips=1`) E1–E6 valódi böngészőben, képernyőképpel; átfedés / levágás / vízszintes görgetés ellenőrzése 390 px és 1280 px szélességen.
- Kapuk: `npm run check`, `npm run lint`, `npm test`, `npm run build`.

## 8. Kockázatok / visszavonási terv

- A hang a nem hivatalos Google-fordító TTS (meglévő függőség): ha leáll, a kisfilm néma + feliratos marad. Későbbi csere
  (pl. Azure `hu-HU-NoemiNeural`) csak a hangvégpontot érinti, a kisfilm-adatot nem.
- A modell tartalmi hibája: a számhűség-kapu csak a számokat védi; a mondatok forráshűségét a prompt kéri, gépi kapu nem
  bizonyítja. Ezért az automatikus gyártás külön kapcsolóval, alapból kikapcsolva érkezik, és a tulajdonos az első
  automatikus kisfilmeket élesben megnézheti, mielőtt bekapcsolva hagyja.
- Költség: fejezetenként egy Haiku-hívás (becslés: ~2–3 ezer bemeneti, ~1 ezer kimeneti token → lecke kb. 0,05–0,15 USD;
  UNVERIFIED, az első éles futás méri), napi plafonnal.
- Visszavonás: `LESSON_CLIPS=0` (azonnal, telepítés nélkül); végleges: a PR visszavonása + `DROP TABLE lesson_clips`.

## 8b. Mérés a kézi próbán (2026-11-10)

- A Dinamika-lecke 12 kézi kisfilmje: 55 jelenet, 5516 karakter elmondott szöveg. Az éles hangvégpontról mind az 55 hang
  letölthető (HTTP 200); a hangok hossza fejezetenként 30,7–43,9 mp, összesen 444 mp (1,1-szeres lejátszással kb. 404 mp ≈ 6,7 perc).
  Egy fejezet kisfilmje tehát kb. fél perc; a teljes, 12 fejezetes lecke lejátszási listája a tervezett kb. 5 percnél hosszabb —
  az automatikus gyártás promptja ezért fejezetenként legfeljebb 520 karaktert kér (a séma plafonja 900 marad).
- A kézi kisfilmek a valódi lecke fejezetszövegéhez mérve átmennek a tartalmi kapukon (séma, fejezetcím-egyezés, számhűség).

## 9. Szeletek

- S1: adatszerződés, tábla, kiszolgálás, lejátszó, kézi kisfilmek a Dinamika-leckéhez (a „saját kezű” próba).
- S2: háttérgyártás a tananyagkészítő után (kapcsolóval).

Egy PR-ban készül (a ~400 soros irányelvet meghaladja: a 12 fejezet kézi forgatókönyve adat, nem logika).

## 10. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-10-fejezet-kisfilmek-vegrehajtas.md`
