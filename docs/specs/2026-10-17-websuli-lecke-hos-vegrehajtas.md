# Websuli lecke-hős — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-websuli-lecke-hos.md`. Ág: `feat/websuli-kepkeszlet` (a képkészlet-szelettel közös PR, mert a képek
nélkül a hős nem ellenőrizhető). A parancsok a `source/` mappából futnak.

1. **`shared/lesson-design.ts`:**
   - `DESIGN_THEMES[*].motto`: a terv táblázata;
   - `DESIGN_THEMES[*].bubble`: csak explorer és adventure.
2. **`shared/design-assets.ts`:**
   - Bemenet: `pickLessonArt(lesson, catalog, band)`.
   - Kimenet: `{ cover?: DesignAsset; hero?: DesignAsset; mascot?: DesignAsset; subjectIcon?: DesignAsset }`.
   - Illesztés: kisbetűs, ékezettűrő (NFC + `normalize("NFD")` és ékezet-eltávolítás) egyezés a `subjects` és a `keywords` mezőn a
     lecke `subject`-jével és címével.
   - Kabala: `mascot-hello` (1–2.), `mascot-explorer` vagy `mascot-hello` (3–5.).
3. **`client/src/lesson-runtime/LessonArt.tsx`:**
   - `<figure class="ws-art">` és `<img>`, a katalógus alt szövegével.
   - Kabala és buborék a megfelelő sávban.
   - Tartalék: `LessonCoverArt`.
4. **`LessonRuntime.tsx`:**
   - A `.ws-topbar` helyére `.ws-bandhead`: jelvény, évfolyam, téma neve, mottó.
   - A `LessonCoverArt` helyére `LessonArt`.
   - A tantárgy-címke ikonnal, ha van.
5. **`lesson-design.css`:**
   - `.ws-bandhead`, `.ws-art` (sarok 16–20 px, `object-fit: cover`, képarány), `.ws-bubble`, `.ws-subject-ico`.
   - A hős-kártya rácsa: asztali nézetben szöveg és kép egymás mellett, mobilon a kép fölül.
6. **Tesztek:**
   - `tests/design-assets.test.ts`: a `pickLessonArt` illesztése (borító, hős, tartalék, ékezettűrés, -young ikon).
   - `tests/lesson-design.spec.ts`, dokumentált változással: a felső sáv szövegének ellenőrzése a sávfejlécre vált.
   - Új e2e:
     - minden sávban: a kép betölt, van alt szövege;
     - 1–5.: buborék és kabala; 6–12.: nincs;
     - nincs kilógás;
     - képernyőkép.
7. **Kapuk:** tsc, check:test, lint, unit, célzott Playwright (workers=1); képernyőképek összevetése a koncepcióképpel.
8. **Kiegészítés, változatos választás:**
   - `pickLessonArt(lesson, band, catalog)`: `lesson.seed` (azonosító) és FNV-1a alapú rotáció a terv kiegészítése szerint.
   - `LessonRuntime`: `seed = lessonId ?? persistId ?? title`.
   - Tesztek: stabilitás, változatosság, korosztály-elválasztás.
9. **Review #273:**
   - A tárgyikon csak a korosztálynak megfelelő változat lehet, a másik korosztályé helyett nincs ikon.
   - A `LessonArt` mindig renderel, kép híján a rajzos tartalékot (`LessonCoverArt`) adja.
10. **Review #273, második kör:**
    - A kulcsszavas borítóhoz a tantárgy is kell.
    - A Csendes nézet a hős-képet is halványítja.
    - A `--max` csak nemnegatív egész lehet.
    - A katalógus eredete a kiválasztott fájl saját naplóbejegyzéséből jön (`provenanceFor`), hiányzó bejegyzésnél még a kimenet
      előtt hiba.
