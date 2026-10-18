# Admin-maradványok kivezetése — terv

**Tulajdonosi döntés (2026-10-18, „Mindet kérem”):** az admin-korszerűsítés (`2026-10-18-admin-korszerusites.md`) után meghagyott,
végpont nélküli maradványok kivezetése.

## Felmérés (kódból)
- **Régi modellbeállítások.** A `server/ai/models.ts` `LEGACY_MODELS` 7 kulcsa (`htmlFix`, `htmlTheme`, `htmlFixStream`,
  `claudeChat`, `analyzeFiles`, `chatgptChat`, `claudeHtml`) a #287-ben törölt útvonalakhoz tartozott.
  - Csak a `server/scripts/checkAIConfig.ts` feliratai és két teszt hivatkozik rájuk.
  - Élő kulcs marad: `improve`, `quizGenerator`, `webResearch`.
- **`/api/ai/` rétegek:** egyik mögött sincs már végpont.
  - `server/index.ts`: `aiLimiter` és `aiPayloadGuard` (`server/lib/ai-payload-guard.ts`);
  - `server/lib/body-limits.ts`: `/api/ai/` bejegyzés;
  - `server/routes.ts`: CSRF-kivétel a `/api/ai/` előtagra.
- **Fájlmentés-végpontok:** `GET /api/admin/file-backups`, `POST …/restore/:filename`, `GET …/download/:filename`.
  - A felület nem hívja őket.
  - Az automatikus mentés a Render ideiglenes lemezére ír (`backups/`), ezt minden deploy törli.
  - A valódi mentés a Neon adatbázis-mentése és az admin „Mentés és visszaállítás” exportja/importja (`/api/admin/backups/*`), ezek
    maradnak.

## Döntések
1. A 7 `LEGACY_MODELS` kulcs és a hozzájuk tartozó effort- és felirat-bejegyzések törlődnek.
   - A tesztek a felülírás-, kulcs- és effort-mechanizmust a megmaradt kulcsokon ellenőrzik.
   - Dokumentált spec-változás.
2. A `/api/ai/` limiter, payload-őr (a modul és a tesztje), méretkorlát-bejegyzés és CSRF-kivétel törlődik.
   - A CSRF-kivétel megszűnése szigorítás.
   - Az őr-tesztek a megmaradt kivételekre igazodnak.
3. A három fájlmentés-végpont és a csak általuk használt `listBackups` / `readBackup` törlődik.
   - Az automatikus mentés írása (`createAutoBackup`, `triggerEventBackup`, cron) változatlan, a Render shellből elérhető marad.

## Nem-cél
- Az automatikus mentés cronjának és az adatbázis-export / -import funkciónak a módosítása.

## Elfogadás (EARS)
- A törölt kulcsokra, útvonalakra és modulokra nincs hivatkozás (`grep`).
- A teljes egységteszt-, típus- és buildkör zöld.
- Az admin „Mentés és visszaállítás” fül változatlanul működik (meglévő tesztek).
