# Végrehajtás — princess világ + különlegességek
1. shared/lesson-visuals.ts: princess világ, LESSON_FLAIRS, pickLessonFlair, designFromInstruction.
2. shared/lesson-experience.ts: EXPERIENCE_THEMES += princess; experiencePacketSchema.flair optional.
3. client/src/lesson-runtime/lesson-experience.css: princess sor (a palettával egyező), flair-effektek reduced-motion/quiet őrrel.
4. LessonRuntime.tsx: data-flair a gyökéren; hero díszítőelemek (aria-hidden).
5. experience-builder.ts: deps.flair; structured-improvement.ts: designFromInstruction → theme/flair + emoji-sor a kérésben.
6. role-skills.ts / repair-skill.ts: rövid design/változatosság sorok (méretkorlát alatt).
7. tests/lesson-flair.test.ts; kapu; PR; deploy; utána a lecke újragenerálása és alkalmazása; élő képernyőkép.
