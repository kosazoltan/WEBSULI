# Websuli tantárgyi ikonkészlet — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-websuli-ikonkeszlet.md`. Ág: `feat/websuli-ikonkeszlet`. A parancsok a `source/` mappából futnak.

1. **`scripts/design-assets/subject-icon-plan.ts`:** a NAT szerinti `SUBJECT_BANDS` mátrix (72 pár), a `BAND_ICON_STYLE`
   (stílus és referencia) és a `SUBJECT_MOTIFS` (korosztályonként érő motívum).
   - `scripts/design-assets/add-subject-icons.ts`: idempotensen felveszi az `icon-<tantárgy>-<sáv>` tételeket a
     `design-assets/prompts.json`-ba.
2. **Gyártás és jóváhagyás:**
   - `generate.ts --only <72 id> --max 80` (≈ 6,7 USD);
   - önellenőrzés (szöveg nincs a képen, a stílus a sávé);
   - a tulajdonos döntése szerint mind jóváhagyva: `approve.ts`.
3. **`shared/subject-icons.ts`:**
   - Bemenet: `subjectIconId(subject, classroom)`.
   - Lépések: `subjectKeyOf` → tantárgykulcs, `designThemeForClassroom` → sáv.
   - Kimenet: `icon-<kulcs>-<sáv>`, ha a mátrixban van, különben `null`.
   - A mátrix (`SUBJECT_BANDS`) innen exportált, a szkript innen importálja.
4. **`shared/schema.ts` és `migrations/0028_design_assets.sql`:** `design_assets` tábla.
   - Mezők: `id varchar(64) pk`, `kind`, `band`, `subjects text[]`, `keywords text[]`, `alt`, `mime`, `sha256 char(64)`, `bytes bytea`,
     `origin`, `model`, `prompt_hash`, `approved_at timestamptz`, `updated_at`.
   - Additív, idempotens.
5. **`server/design-assets.ts`:**
   - `syncDesignAssets()`: a `DESIGN_ASSET_CATALOG` minden eleméhez beolvassa a WebP-t (`dist/public/design`, ennek hiányában
     `client/public/design`), és upsertel. Csak akkor ír, ha az sha256 eltér. A hiányzó fájlt naplózza, nem áll le.
   - `lessonArtFor(json)`: a `subjectIconId` szerinti azonosítót csak akkor adja, ha az a táblában létezik.
   - `GET /api/design-assets/:id`:
     - siker: bájtok, `Content-Type` a `mime` szerint, `Cache-Control: public, max-age=31536000, immutable`, `ETag` az sha256;
     - hibás azonosító: 400; nem létező: 404.
6. **`server/index.ts`:** az induláskor a migráció-ellenőrzés után `syncDesignAssets()` fut. Hiba esetén figyelmeztet, a szerver
   indul tovább.
7. **`shared/lesson-schema.ts`:** `art: z.object({ subjectIcon: z.string().regex(/^[a-z0-9-]{3,64}$/).optional() }).strict().optional()`.
   - **`server/studio/pipeline-store.ts` `upsertLesson`:** mentés előtt a `json.art.subjectIcon` értéke a
     `lessonArtFor(json)` eredménye. A tantárgy és az évfolyam ekkor ismert. Hiba esetén ikon nélkül ment.
8. **Lejátszó (`LessonArt` / `LessonRuntime`):** ha van `lesson.art.subjectIcon`, a címke ikonja a
   `/api/design-assets/<id>`, különben a mai katalógus-választás.
9. **Tesztek:**
   - unit: `subjectIconId` (kulcs, sáv, ismeretlen, nem tanított pár); a mátrix minden párjához van jóváhagyott katalógustétel;
   - DB (eldobható Postgres, `tests/design-assets-db.integration.ts`, a `0028` kétszer):
     - a szinkron idempotens;
     - a végpont 200 / 404 / 400;
     - `upsertLesson` beírja az `art.subjectIcon`-t;
   - e2e: a lejátszó a `art.subjectIcon` ikont mutatja.
10. **Kapuk:** tsc, check:test, lint, unit, `test:learning-db`, célzott Playwright.
