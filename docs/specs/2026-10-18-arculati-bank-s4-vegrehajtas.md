# Arculati bank S4 — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-18-arculati-bank-s4.md`. Ág: `feat/arculat-s4`. A parancsok a `source/` mappából futnak.

1. **`shared/lesson-ui-text.ts` (tiszta):**
   - `VERDICT_TEXT = { right, wrong }`;
   - `stripVerdictPrefix(text)`: a nyitó „Helyes”, „Nem helyes”, „Téves”, „Igen”, „Nem”, „Így van”, „Pontosan”, „Jó válasz”,
     „Rossz válasz” levágása, ha utána `.`, `:`, `,`, `!` vagy gondolatjel áll; a szöveg nagybetűvel folytatódik;
   - `SECTION_ROLE_HEADING`, `sectionRoleOf(heading)`;
   - `METHOD_LABEL` (a `CognitiveMethods` `LABELS`-e), `stripMethodPrefix(title, kind)`.
2. **Lejátszó:** egy `VerdictFeedback` komponens (ítélet a szótárból + levágott szöveg). Bekötés:
   - `LessonRuntime` check blokk;
   - `LessonExperienceView` kvíz (a „Nem válaszoltál” sorban is levágott szöveg);
   - `SavedLessonQuiz` (élő és áttekintő);
   - `HtmlLessonQuiz` (a dupla előtag megszűnik);
   - `CognitiveMethods`: a `METHOD_LABEL` és a `stripMethodPrefix` a címen.
3. **Prompt:** a `step-io.ts` sablonos fejezetcímei a `SECTION_ROLE_HEADING`-ből (bájtra azonos szöveg); a `role-skills.ts` rövid alakjai szerep-aliasként (review #285, a skill szövege bájtra marad).
4. **`flair`:**
   - az `experience-builder` nem állítja;
   - a `structured-improvement` nem viszi tovább;
   - a `designFromInstruction` nem ad `flair`-t;
   - a `lesson-experience.css` halott `[data-flair]` szabályai törlődnek;
   - a `lesson-flair.test.ts` a dokumentált spec-változás szerint frissül: a gyártás nem ad flair-t, a lejátszó nem rendereli,
     a régi adat olvasható; a kitalált érték elutasítása marad.
5. **Tesztek:**
   - unit: `stripVerdictPrefix` (az összes mért nyitás és negatív esetek: „Nem minden …”, „Igenis”), szerep-szótár, módszercím;
   - a prompt bájtra azonos (a role-skill verziója változatlan);
   - Playwright: a check blokk visszajelzése a szótár ítéletével, dupla előtag nélkül.
6. **Kapuk:** tsc, check:test, lint, unit, célzott Playwright, build.
