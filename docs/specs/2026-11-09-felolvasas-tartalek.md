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
