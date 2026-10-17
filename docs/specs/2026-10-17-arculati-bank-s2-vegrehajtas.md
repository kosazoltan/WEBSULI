# Websuli arculati bank — végrehajtási utasítás (AI-ügynöknek), S2–S3: blokkjelzők, fejezetdíszek, kabalapózok

Terv: `docs/specs/2026-10-17-arculati-bank.md`. Ág: `feat/arculati-bank-s2` (az S1 ágára épül, a #277 merge-e után a main
behúzva). A parancsok a `source/` mappából futnak.

**Eltérés a tervtől (mérve, 2026-10-17):** a képmodell képarányai 1:1, 3:2, 4:3, 16:9 és 21:9. A tervezett 8:1-es
fejezetelválasztó nem gyártható. Helyette **fejezetdísz** készül: kis, középre helyezett, 1:1-es díszítőelem, sávonként 2 db
(`divider-<sáv>-<1|2>`), világos, üres háttéren.

1. **`scripts/design-assets/add-block-art.ts`:** idempotensen felveszi a tételeket a `prompts.json`-ba (`batch: 4`).
   - **Blokkjelző** `marker-<blokktípus>-<sáv>`: 6 blokktípus (`explain`, `example`, `try`, `check`, `recap`, `animate`) × 5 sáv.
     1:1, a sáv ikonstílusával (`BAND_ICON_STYLE`). Referencia nincs: a próbák szerint a modell másolja a referenciát.
   - **Fejezetdísz** `divider-<sáv>-<1|2>`: 1:1, a sáv motívumvilága (pl. 1–2.: levél és virág; 11–12.: absztrakt fénycsík).
   - **Kabalapóz** `mascot-<blokktípus>`: 6 db, az 1–5. évfolyamra; referencia a `mascot-base` (ugyanaz a figura).
   - Minden prompt a tárgyat helyezi előre, és tiltja a szöveget.
2. **Gyártás és jóváhagyás:**
   - `generate.ts`, három szálon (46 kép ≈ 4,2 USD).
   - Önellenőrzés áttekintő lapon: egységes stílus sávonként; a jelzők egymástól jól megkülönböztethetők; a kabala ugyanaz a
     figura.
   - `approve.ts`: a jelző és a dísz 256 px, a kabala 512 px (a `WIDTH` táblába felvéve a `marker` és a `divider`).
3. **`shared/block-art.ts`:** tiszta függvények, katalógusból:
   - `blockMarkerFor(kind, band)` → `marker-<kind>-<band>`;
   - `dividerFor(band, index)`;
   - `blockMascotFor(kind, band)`: csak 1–5. évfolyam, fejezetenként legfeljebb egyszer (a hívó dönt az első blokkról).
4. **Lejátszó (`LessonRuntime` / blokk-fejléc):**
   - A blokk-fejlécben a jelző ikonja (24 px, `alt=""`). Hibánál nincs kép (a lucide ikon marad).
   - A fejezetek között a fejezetdísz (40 px).
   - Az 1–5. évfolyamon a fejezet első blokkja mellett a kabalapóz (64 px, keskeny kijelzőn a blokk fölött).
   - A képek az `/api/design-assets/`-ről jönnek, katalógus-tartalékkal.
5. **Tesztek:**
   - unit: lefedettség (6 × 5 jelző, 10 dísz, 6 kabala jóváhagyva, létező fájllal); a tiszta függvények;
   - e2e: a `lesson-design`, a `lesson-responsive` (8 méret × 5 sáv) és a `subject-icon` zöld; az új elemek nem okoznak
     kilógást.
6. **Kapuk:** tsc, check:test, lint, unit, `test:learning-db`, a célzott Playwright és a build. A PR-ba áttekintő lapok kerülnek.
