# Végrehajtás: V5c — sorozatjelvény

Terv: `docs/specs/2026-11-25-v5c-sorozatjelveny.md`.

1. **Bukó tesztek:** `tests/lesson-streak.test.ts` (tiszta szabályok: jó / rossz kör, kettős számítás, azonos lecke, szintek, sérült
   tároló); `tests/lesson-streak.spec.ts` (KI: nincs sáv és nincs kulcs; BE: Bronz a 3. jó leckénél, nullázás 80 % alatt, újratöltés).
2. **Zöldre hozás:** `shared/lesson-streak.ts`; `client/src/lesson-runtime/streakBadge.tsx` (kapcsoló, tároló, sáv);
   `LessonExperienceView.tsx` bekötés a kvíz „kész” állapotára.
3. **Próbahiba:** a kettős számítás őrét kiiktatva a megfelelő teszt bukik.
4. **Kapulánc:** gate:stage → gate:push → helyi ellenőr → PR.
