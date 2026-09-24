# Végrehajtás
1. shared/lesson-experience.ts: tolerantLessonInput.
2. client/src/lib/app-version.ts: newerBuildAvailable + reloadIfNewerBuild (egyszer, sessionStorage-kulcs).
3. LessonView.tsx: tolerantLessonInput → safeParse; hibánál reloadIfNewerBuild + Frissítés gomb.
4. tests/lesson-version-skew.test.ts; kapu; PR; deploy; élő ellenőrzés.
