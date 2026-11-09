# Spec: a „Meghallgatás” mindig szóljon — szerveroldali hangtartalék

> Dátum: 2026-11-09 · Állapot: **JÓVÁHAGYVA (tulajdonos hibajelentése, 2026-11-09: „Nem működik a hangfelolvasás a böngészőben.”)**
> Végrehajtás: `docs/specs/2026-11-09-felolvasas-tartalek-vegrehajtas.md`.

## Mért tény
- Képernyőkép (Android, Kiejtés fül, „slender”): „A hang most nem érhető el ezen az eszközön.”
- `source/client/src/lesson-runtime/ExperienceSpeech.tsx` `speakText`: kizárólag a böngésző `speechSynthesis` motorja; az
  `utterance.onerror` bármilyen hibakódra (a nem-hibás `interrupted` / `canceled` is) a fenti üzenetet adja. Tartalék nincs.
  A `cancel()` után azonnal `speak()` — Android Chrome-on ismert, hogy ez az új kimondást megszakíthatja.
- Androidon a felolvasás a telefon TTS-motorjától függ (pl. Google-szolgáltatás nélküli készüléken nincs motor, vagy az angol
  hang nincs letöltve) → `synthesis-failed` / `language-unavailable` / `voice-unavailable`, vagy néma, el sem induló kimondás.
- Van szerveroldali felolvasás: `POST /api/tts` (`google-tts-api`, base64 MP3, `ttsLimiter` 60 / 15 perc / IP). A Vercel CSP
  (`default-src 'self'`) miatt `data:` / `blob:` hang nem játszható le, azonos eredetű URL igen (a `/api/*` a Renderre proxyzott).

## Cél
- A „Meghallgatás” minden eszközön szóljon: elsőként a böngésző hangja; ha az hibát ad, 3 mp-en belül el sem indul, vagy a
  böngészőben nincs a nyelvhez hang, a szerver MP3-a szól azonos eredetű `GET /api/tts/audio?text=…&lang=…` címről.
- Hibaüzenet csak akkor, ha a tartalék is elbukik.
- `interrupted` / `canceled` (másik gomb megnyomása) nem hiba.

## Nem cél
- A beszédfelismerés (Mondd ki!), a régi HTML-anyagok TTS-hídja, a `POST /api/tts` viselkedése.
- Fizetős TTS-szolgáltatás.

## Döntések
- Új végpont: `GET /api/tts/audio` (mellékhatás nélküli, gyorsítótárazható: `Cache-Control: public, max-age=86400`),
  `audio/mpeg` bájtok; a `ttsLimiter` a `/api/tts` előtag miatt ezt is védi. Szöveg ≤ 300 karakter, nyelv a meglévő fehérlista
  szerint; a régiós kód (pl. `en-GB`, `en-AU`) → alapnyelv (`en`), mert a szolgáltatás csak azt fogadja el (mérve: `en-GB` → hiba, `en` → MP3). A szöveg tananyagszó / -mondat, nem személyes adat.
- Kliens: tiszta segédfüggvények a `shared/speech-fallback.ts`-ben (nyelvkód, URL, puha hibák, van-e a nyelvhez böngészőhang).
- A tartalék hang `playbackRate` = a lecke felolvasási sebessége.

## Edge case-ek
- Hanglista még üres (Android első betöltés) → a böngésző próbálkozik, a 3 mp-es őr és a hibakezelő vált tartalékra.
- `speechSynthesis` hiányzik → azonnal a tartalék (eddig: „Felolvasás ezen az eszközön nem elérhető.”).
- Gyors egymás utáni gombnyomás: az előző kimondás és a tartalék hang leáll, csak az utolsó szól.
- Szerver 429 / 500 / hálózati hiba → a meglévő hibaüzenet.

## Elfogadás (EARS)
- [ ] A1: WHEN a böngésző kimondása `synthesis-failed` (vagy más nem-puha) hibát ad THEN a kliens SHALL a `/api/tts/audio` hangot
      játssza le, hibaüzenet nélkül.
- [ ] A2: WHEN a kimondás 3 mp-en belül nem indul el THEN SHALL a tartalék szól.
- [ ] A3: WHEN `interrupted` / `canceled` THEN nincs tartalék és nincs hibaüzenet.
- [ ] A4: WHEN van hanglista, de a nyelvhez nincs hang THEN azonnal a tartalék szól.
- [ ] A5: `GET /api/tts/audio` érvénytelen bemenetre 400; érvényesre `audio/mpeg`.
- [ ] A6: `check`, `lint`, `check:test`, `npm test`, Playwright (lesson-fusion) zöld; élesben `GET /api/tts/audio?text=slender&lang=en` → 200 audio/mpeg.

## Módosítás (2026-11-09, tulajdonosi kérés: „Ellenőrizd le még egyszer a hanglejátszás logikáját, üzleti logikáját.”)

### Mért tény (élő próba az összevonás után)
- `GET https://websuli.vip/api/tts/audio?text=slender&lang=en` → 200 `audio/mpeg`, de a válasz fejléce
  `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` és `X-Vercel-Cache: MISS`: a `vercel.json` `/api/(.*)` fejlécszabálya
  felülírja a szerver `public, max-age=86400` fejlécét (közvetlen Render-hívásnál a `public` fejléc látszik). Minden gombnyomás a
  Renderig és a Google-szolgáltatásig megy.
- A `ttsLimiter` kulcsa (`req.ip`) a Vercel-proxy címe, nem a tanulóé: ugyanarról a gépről a közvetlen és a Vercelen átmenő kérések
  számlálója külön fut, a Vercelen átmenőé kiszolgálónként ingadozik. A 60 kérés / 15 perc keretet így az összes látogató együtt fogyasztja.
- `Range: bytes=0-1` kérésre 200 jön `Accept-Ranges` / `Content-Range` nélkül. Az iOS Safari a hangot tartománykéréssel tölti, és 206-ot vár.

### Döntések
- **Gyorsítótár:** a `/api/tts/audio` kikerül a Vercel `no-store` szabálya alól (`/api/((?!tts/audio$).*)`), és saját szabályt kap:
  `x-vercel-enable-rewrite-caching: 1` (a Vercel külső átírásnál csak ezzel veszi figyelembe a forrás gyorsítótár-fejléceit).
  A szerver fejlécei: `Cache-Control: public, max-age=86400` (böngésző, 1 nap) és `CDN-Cache-Control: max-age=604800` (Vercel CDN, 7 nap).
  A többi `/api/*` válasz marad `no-store`.
- **Korlát:** a `/api/tts/audio` külön korlátot kap (`ttsAudioLimiter`, 600 kérés / 15 perc), a `ttsLimiter` (60 / 15 perc) ezt az
  útvonalat kihagyja. Ok: a kulcs a proxy címe, a keret közös; a CDN-gyorsítótár miatt a szerverig csak az új szavak jutnak el.
- **Tartománykérés:** `Accept-Ranges: bytes`; egyetlen érvényes tartományra 206 + `Content-Range`; teljesíthetetlenre 416;
  több tartományra vagy értelmezhetetlen fejlécre teljes 200-as válasz.

### Nem cél
- A többi IP-alapú korlát (bejelentkezés stb.) kulcsának javítása — ugyanaz a hiba érinti, külön feladat.
- A kliens lejátszási logikája (`ExperienceSpeech.tsx`) — az átnézés nem talált benne javítandó hibát; a maradó, valódi eszközön
  nem mért kockázatokat a zárójelentés sorolja fel.

### Elfogadás (EARS)
- [ ] B1: WHEN `GET /api/tts/audio` érvényes kérés a websuli.vip címen THEN a válasz SHALL `Cache-Control: public, max-age=86400`
      fejlécet hordoz, és ismételt kérésre `X-Vercel-Cache: HIT`.
- [ ] B2: WHEN más `/api/*` útvonal THEN a válasz SHALL továbbra is `no-store`.
- [ ] B3: WHEN `Range: bytes=0-1` THEN SHALL 206, `Content-Range: bytes 0-1/<méret>`, 2 bájt.
- [ ] B4: WHEN teljesíthetetlen tartomány THEN SHALL 416.
- [ ] B5: a `/api/tts/audio` korlátja 600 / 15 perc; a `POST /api/tts` korlátja változatlanul 60 / 15 perc.
