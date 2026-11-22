# Kisfilm-mozgókép: a megszűnt Seedance 1.5 helyett Seedance 2.0 Mini, beállítható modell és felbontás

Állapot: terv, 2026-11-22. Kapcsolódik: `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md`, `docs/fejezet-kisfilmek-hasznalat.md`.

## Probléma (mérve, élesben)

A tulajdonos kérésére 2026-11-22 15:33 UTC-kor bekapcsolt gyártás első fejezete (lecke `9cf4bda3-…`, 1. fejezet) mind a négy
jelenetnél mozgókép nélkül készült. A Render-napló:

```
[lesson-clips] a mozgókép nem készült el, a jelenet állóképes: mozgókép: HTTP 404 {"error":{"message":"No endpoints found for bytedance/seedance-1-5-pro.","code":404}}
```

Az OpenRouter a `bytedance/seedance-1-5-pro` modellt megszüntette. A gyártást 15:39-kor kikapcsoltuk (`LESSON_CLIPS_AUTO=off`), hogy a többi
lecke ne kapjon állóképes kisfilmet. A memória a körben legfeljebb 194 MB volt, újraindulás nem történt.

## Döntés (tulajdonos, 2026-11-22)

Seedance 2.0 Mini (`bytedance/seedance-2.0-mini`). Mérés (felhős munkamenetből, ugyanazzal a kezdőképpel, 5 mp, első képkockából):

| Felbontás | Kimenet | Ár (OpenRouter `generation.total_cost`) | USD / mp |
|---|---|---|---|
| 720p | 1280×720, 2,9 MB | 0,381 | 0,076 |
| 480p | 864×496 | 0,177 | 0,035 |

A régi, jóváhagyott Seedance 1.5 kb. 0,026 USD / mp volt. A lejátszó 960 px széles képet kap (`FFMPEG_ARGS`: `scale=960:-2`), ezen a méreten
a 480p és a 720p képkockája szemre azonos (összevetve). A stílus rajzfilmszerű, a mozgás valódi (az autó elhalad, a kamera emelkedik).
**Alapérték: 480p** — az ár a jóváhagyott szint közelében marad (4 jelenet × 5–7 mp ≈ 0,7–1,0 USD / fejezet).

## Cél

- A mozgókép újra elkészül: alapból `bytedance/seedance-2.0-mini`, `480p`.
- A modell és a felbontás kódmódosítás nélkül cserélhető: `LESSON_CLIP_VIDEO_MODEL`, `LESSON_CLIP_VIDEO_RESOLUTION` (`480p` | `720p`).
  Egy következő modellmegszűnésnél elég a Render-beállítás.

## Nem cél

- A gyártósor egyéb részei (kép, hang, hangkapu, átkódolás, memóriaőr) változatlanok.
- A már tárolt, állóképes fejezet automatikus újragyártása (a `sourceHash` nem változott): külön, kézi lépés (lásd lent).

## Megoldás

- `source/server/lesson-clips-providers.ts`: `CLIP_VIDEO_MODEL` helyett `clipVideoModel(env)` és `clipVideoResolution(env)` tiszta
  függvény; az alapérték a fenti. A modellnév csak a `szolgáltató/név` alakot fogadja el (`/^[a-z0-9._-]+\/[a-z0-9._-]+$/`), a felbontás
  csak `480p` / `720p`; érvénytelen érték → alapérték (naplózva egyszer).
- A beküldés a beállított modellt és felbontást használja; a többi mező (`duration`, `aspect_ratio: "16:9"`, `generate_audio: false`,
  `frame_images` első képkocka) változatlan — a 2.0 Mini mindet támogatja (`supported_durations` 4–15, `first_frame`).
- `docs/fejezet-kisfilmek-hasznalat.md`: a két új kapcsoló, az új ár.

## Edge case-ek

- A beküldött `duration` a 2.0 Mini tartományán (4–15 mp) belül marad: a gyártósor már most 4 és 12 közé szorítja
  (`source/server/lesson-clips.ts`, `Math.min(12, Math.max(4, …))`) — változtatás nem kell, teszt rögzíti.
- Üres / szóközös env-érték → alapérték.
- A felhős munkamenetben a gyártósor videólépése a védett letöltő saját DNS-feloldása miatt nem fut (`getaddrinfo ENOTFOUND openrouter.ai` —
  a proxy mögött); ez környezeti korlát, a Renderen nincs ilyen. A modellt ezért közvetlen API-próbával mértük.

- **Tesztstabilitás (mérve, 2026-11-22):** a `lesson-clip-worker.test.ts` két meglévő tesztje („a DNS-feloldás várakozását…”,
  „az elakadt letöltési törzs…”) csak `AbortSignal.timeout`-ra vár. Ennek az időzítője Node-ban nem tartja életben a folyamatot
  (unref), ezért függő munka nélkül a futás idő előtt véget ér: a teszt és a mögötte állók „cancelledByParent” lesznek. Felhős
  munkamenetben a változatlan mainen is mérve (3 lemondott teszt); a CI-ban más függő munka miatt nem jön elő. Javítás: a két teszt
  a futása alatt egy életben tartó időzítőt tart (`setInterval` + `clearInterval`). Az állítások nem változnak, csak a futás lesz
  determinisztikus.

## Elfogadás (EARS)

- AMIKOR nincs `LESSON_CLIP_VIDEO_MODEL`, a beküldés modellje `bytedance/seedance-2.0-mini`, a felbontása `480p`.
- AMIKOR a változó érvényes, a beküldés azt használja; AMIKOR érvénytelen, az alapértéket.
- A beküldött `duration` mindig 4 és 12 közé esik (a 2.0 Mini 4–15-öt fogad el).
- Élesben a bekapcsolás utáni első fejezet naplója: „N mozgókép (0 nélkül)”, a memória a 450 MB-os kézi küszöb alatt.

## Élesítés és visszavonás

1. Összevonás + telepítés (a fő szál, `gate:merge`). 2. A tárolt állóképes fejezet sora törlése (`lesson_clips`, lecke `9cf4bda3-…`,
`section_index` 0) — a következő kör újragyártja; tulajdonosi jóváhagyással. 3. `LESSON_CLIPS_AUTO=on`, az első kör figyelése.
Visszavonás: `LESSON_CLIPS_AUTO=off`; modellprobléma esetén `LESSON_CLIP_VIDEO_MODEL` átírása.
