# Tornádó: motorfék — gáz nélkül az autó hamar megáll (2026-09-29)

## Kiváltó ok (mérve)
- **Tulajdonos:** „az irányítás lassú, … nem tudom egyenesben tartani”. A #140 1,6-szorosára emelte a végsebességet.
- **Mérés:** a `stepVehicle` (`client/src/lib/tornado/drive.ts`) gáz nélkül csak a gördülési csillapítással lassít
  (`0,15 + (1 − grip) · 1,2` / s; grip 0,8-nál ≈ 0,39 / s). Elengedés után 2,5 s-mal az autó még a végsebesség kb. 38%-ával gurul.
- **E2E:** a `games-touch-controls.spec.ts` „felengedés után a tárcsa tényleg elenged” teszt emiatt határeseti lett.
  - Helyben a mainen és a #145-ön is: nyomva 0,07–0,08 km, felengedve 0,06 km.
  - CI a #145-ön: 0,040 = 0,040, bukás.
- A gyerek felől: „felengedtem, mégis megy” — a pontos irányítást rontja.

## Cél
Ha a gyerek elengedi a gázt (tárcsa középen vagy billentyű felengedve), az autó rövid, kiszámítható úton álljon meg.
A menet közbeni gyorsulás, a végsebesség és a kormányzás ne változzon.

## Döntés
- `ENGINE_BRAKE_PER_S = 1,2`: ha `|throttle| < 0,05` és nincs kézifék, a sebesség ennyivel többet csillapodik
  másodpercenként (exponenciálisan, dt-független). 2,5 s után a végsebesség < 5%-a marad (korábban ≈ 38%).
- Gázzal (akár részleges tárcsával) a mozgás változatlan.

## Elfogadás (EARS)
- **E1** Végsebességről gáz nélkül 2,5 s után a sebesség SHALL a végsebesség 5%-a alatt legyen, 30, 60 és 144 Hz-es lépéssel is (teszt, a régi kódon bukik).
- **E2** Teljes gázzal a végsebesség és a gyorsulási idő SHALL változatlan legyen (a meglévő `tornado-drive` tesztek zöldek).
- **E3** Kapuk zöldek; a `games-touch-controls` E2E „felengedés” tesztje stabilan zöld.

## Dokumentált tesztváltozás
`tests/tornado-collision.test.ts` „falmenti súrlódás 30, 60 és 144 Hz-en …”: a fő állítás, hogy a súrlódás
frekvenciafüggetlen (±5%), változatlan. A mellékes, abszolút alsó határ (`s60 > 1`) motorfék nélküli kigurulásra volt
kalibrálva; motorfékkel maga a kigurulás is erősebb (fal nélkül 8 → ≈ 2,07, fallal 8 → ≈ 0,76 az 1 s alatt). Helyette a fal hatását egy fal
NÉLKÜLI kigurulási alapvonalhoz mérjük (`s60 < free · 0,99`: a súrlódás tényleg lassít), a „nem áll meg azonnal”
feltétel megmarad (`> 5%`). Ez a súrlódás hatását különíti el, tehát szigorúbb. A konstanst nem a teszthez hangoltuk.

## Review-kör (PR #146)
- **A kigurulási alapvonal száma (Copilot): javítva.** A fal nélküli kigurulás 1 s alatt 8 → ≈ 2,07. A korábban leírt
  0,76 a fallal együtt mért érték volt.
- **Folytonosság az analóg gázban (Codex P2): javítva.** A motorfék nem kapcsol ugrásszerűen 0,05-nél: az
  `ENGINE_BRAKE_PER_S · max(0, 1 − |gáz| / 0,25)` lineárisan fogy, 0,25-ös gáztól nulla. Teszt: 0–0,3 gáz között a
  sebesség monoton, és nincs 5% vmax-nál nagyobb ugrás; a javítás előtt bukott.
