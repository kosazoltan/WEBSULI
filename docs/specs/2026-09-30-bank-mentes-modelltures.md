# Spec: Bankcsomag-mentés és modellhiba-tűrés (nem elakadó közzététel, 3–4. szelet)

> Dátum: 2026-09-30 · Szerző: Claude (Opus 5.5) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás: a teljes folyamat autonóm végigvitele)
> Előzmény: `2026-09-30-nem-elakado-kozzetetel.md`, `2026-09-30-tanari-ellenorzolista.md`

## Cél
Élő bukások (21 nap, `studio_jobs`): „A N. fejezet bankcsomagja a javító kör után sem megfelelő: … t6-gyak-2: hibás számítás …”
(egy-két hibás tétel miatt az egész lecke elveszett), és „a lektor … üres válasz [grok]; fallback: hosszkorlát [sonnet]”.

## Döntések
- **3. szelet — `salvagePacket`** (`server/studio/experience-builder.ts`): a mentő (utolsó) kísérlet után is hibás, de alakilag
  érvényes csomagból a hibaüzenetben NÉV SZERINT megjelölt tételek kikerülnek (szóhatárral illesztve), legfeljebb a csomag
  20%-a (min. 2), legfeljebb 3 körben; csak akkor vesszük át, ha a maradék csomag a TELJES ellenőrzésen (séma, kvóták,
  egy-helyes-válasz, minta-pontozás, ismétlődés) átmegy. Névtelen hiba (pl. hiányzó módszertípus) → a régi bukás.
  Napló: `bank-salvage` eszköz-jelzés.
- **4. szelet — második tartalék** (`SECOND_FALLBACK_MODELS`, `server/ai/models.ts`): pedagógus → `gpt-5.6-terra`, lektor →
  `claude-opus-5-5`; csak modellhívás-hibára, csak beállított kulccsal. A SZERZŐ szándékosan nincs benne (tulajdonosi döntés
  2026-09-29: a szerző tartaléka a saját családjában marad, a lektor független). A lektor-jelentés 40-nél hosszabb
  `solutions` listája levágva, nem buktat.

## Elfogadás
- WHEN a mentő kísérlet után egy csomagban csak néven nevezett tételhibák vannak (≤ 20%) THEN a csomag a hibás tételek nélkül átvéve.
- WHEN az elsődleges és a tartalék modell is hibázik (pedagógus/lektor) THEN a második tartalék fut; ha az is, a hibaüzenet a teljes láncot megnevezi.
- A szerzőnél változatlanul két modell (teszt: (o)).

## Tesztek
`tests/bank-salvage.test.ts`, `(m2)`, `(m3)`, `(o)` a `lesson-pipeline-runner.test.ts`-ben; teljes suite + tsc + lint.
