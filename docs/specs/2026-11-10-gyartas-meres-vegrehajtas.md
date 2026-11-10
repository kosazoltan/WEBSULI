# Végrehajtás — gyártás-mérés 2026-11-10 (J1–J3)

Terv: `docs/specs/2026-11-10-gyartas-meres.md`. Ág: `fix/kanban1-elesites-elonezet-eszkoztar`. Parancsok a `source/` mappából,
Windows-on `npm.cmd` / `npx.cmd`. Meglévő tesztet módosítani, gyengíteni, kihagyni TILOS; ha egy meglévő teszt bukik, az
implementációt kell igazítani.

## J1b — közös kvíz-ismétlődéskulcs (`shared/lesson-experience.ts`)

1. A `questionKey` után új export:
   `quizDuplicateKey(q: { question: string; options?: readonly string[] }): string` — `stem = questionKey(q.question)`; ha a `stem`
   illik a zárt kiválasztó mintára (`^melyik(?:az?)?(?:állítás|mondat|kijelentés|megállapítás)(?:a)?(?:hamis|igaz|helyes|helytelen|téves)$`,
   `u` jelzővel, visszatekintés nélkül) és van opció, a kulcs `stem + "\u0000" + rendezett(questionKey(opció)).join("\u0001")`;
   különben `stem`.
2. A csomag-séma ismétlődés-ellenőrzése (jelenleg `:211-218`): a `quiz` ág kulcsa `quizDuplicateKey(q)`; a `tasks` ágé marad.
3. `server/studio/bank-normalize.ts` `normalizeBankPacket`: a `prior.quiz` elemei `string | { question; options }`; új, elhagyható
   5. paraméter `quizKeyOf` (alapérték: `(q) => keyOf(q.question)`). A meglévő hívások és tesztek változatlanul működnek.
4. `server/studio/experience-builder.ts`: a `crossProblems` kvíz-ága és a `validate` → `normalizeBankPacket` hívás
   `quizDuplicateKey`-t használ (a `before.quiz` elemei kérdés + opciók).

## J1 — célzott javítás teljes újragyártás helyett (`server/studio/experience-builder.ts`)

1. `crossProblems`: a csomagok KÖZTI kapukérdés-ismétlődés tételt nevez meg —
   `Ismétlődő kérdés egy korábbi csomaggal: ${m.id} („…”) — ehhez a kapukérdéshez új, más kérdést írj.`; a csomagon BELÜLI
   ismétlődés marad a `gateQuestionProblems(packet.methods)` általános üzenete.
2. `buildUnit` 4., elhagyható paramétere: `seed?: { packet: unknown; issues: string[] }`. A kísérleti ciklus előtt, ha van `seed`
   és nincs `reviewBase`: `salvageSchema.safeParse(seed.packet)`; egyedi azonosítók; `repairPermissions(seed.issues, …)`.
   Ha van engedély és nincs csomagszintű hiba: `repairBase = previous = a csomag`, `repairAllowed` az engedélyekből, `errors` a
   szokásos alakban (`packetCounts` + elvárt darabszám + hibák), `seeded = true`.
3. Amíg `seeded` igaz, a jelölt elfogadási sémája a `salvageSchema` (a kiinduló csomagot a vak kvízszűrő már a tartalék terhére
   szűkíthette); ha a ciklus teljes újraírásra vált (`repairBase` üres lesz), `seeded = false`, és a `packetSchema` él.
4. `buildUnit` visszatérési értéke kiegészül: `raw` = a csomag mély másolata az azonosító-bélyegzés ELŐTT (a modell saját
   azonosítóival) — a javítómód ezekkel dolgozik.
5. A párhuzamos szakasz utáni ciklus (jelenleg `:877-885`): ütközésnél `logger.info` (`[STUDIO] Bank keresztütközés (N. fejezet):
   … → célzott javítás | teljes újragyártás`), a mentett csomag törlése marad, és
   `buildUnit(start + i, chunk[i], prior, { packet: result.raw, issues })`. Az `issues` a `raw` csomagra újraszámolt
   `crossProblems` (a modell azonosítóival).

## J1 tesztek (új fájl: `tests/bank-cross-repair.test.ts`)

- `quizDuplicateKey`: azonos kiválasztó kérdés eltérő opciókkal → különböző kulcs; azonos opciókészlet más sorrendben → azonos;
  nem kiválasztó kérdés → `questionKey`-jel egyező; „Melyik a legnagyobb szám?” nem kiválasztó.
- `experiencePacketSchema`: két „Melyik állítás hamis?” eltérő opciókkal nem ad „Ismétlődő kérdés” hibát; azonos opciókkal ad.
- `buildLessonExperience` (a `lesson-experience.test.ts:221` mintájára, 2 egység, `concurrency: 3`): a 2. egység EGY kvízkérdése
  egyezik az 1. egységével → a harmadik hívás kérése tartalmazza a „JAVÍTÁSI MÓD” szöveget és a megnevezett tételt; a válasz csak
  azt az egy kvíztételt adja vissza; az eredményben a 2. egység többi tétele az első válaszból való; a hívások száma 3.
- Csomagok közti „Melyik állítás hamis?” eltérő opciókkal: nincs harmadik hívás.

## J2 — célkártya (`shared/lesson-opener.ts`, `shared/lesson-block-label.ts`)

1. `goalCardLines`: a 92. sor ellentmondásának feloldása — a cél bekezdése a szakasz címkéjével kezdődik (pl. „Célunk:”), a címke
   utáni rész egész mondat.
2. `isGoalCardText`: címke nélküli első bekezdés is célkártya, ha utána ≥ 2 bekezdés akadály / miért / megoldás címkével kezdődik,
   és az első bekezdés maga nem ilyen címkével kezdődik. A `lesson-block-label.test.ts:31-34` tesztjei változatlanul zöldek.
3. Új tesztesetek: a mért matematika-szöveg (címke nélküli cél + `**…**` címkés bekezdések) → „A lecke célja”, a következő
   szövegblokk „Történet”; a `lesson-opener.test.ts`-ben az utasítás szövege megköveteli a címkét.
4. Ellenőrizendő mellékhatás: `stripOpenerGoalLabel` (`lesson-opener.ts:32`) és `lesson-teaser.ts:34` címke nélküli célkártyán
   se rontson (a teljes első bekezdés maradjon).

## J3 — számegyenes (`client/src/lesson-runtime/blocks/explanatory-visuals.tsx`)

1. Tiszta segédfüggvény új fájlban: `shared/number-line-labels.ts` —
   `numberLineLabelStep(from, to, step, maxLabels = 7): number` (a legkisebb „szép” lépés {1, 2, 5} × 10^k közül, amely ≥ `step`,
   a `step` egész számú többszöröse, és legfeljebb `maxLabels + 1` feliratot ad) és `isNumberLineLabel(value, labelStep): boolean`
   (a `value` a `labelStep` többszöröse 1e-9 tűréssel; a 0 mindig igaz).
2. `RichNumberLineAnim`: az index alapú `labelEvery` helyett ez a két függvény dönt; az osztásvonalak változatlanok.
3. Új teszt `tests/number-line-labels.test.ts`: (−10..10, 1) → −10, −5, 0, 5, 10; (−14..2, 1) → a 0 benne, minden felirat a lépés
   többszöröse; (0..1, 0,1) és (0..3, 0,5) tört lépés; (3..9, 1) minden felirat; (0..100, 10); a feliratok száma ≤ 8.

## J4 — tömeges e-mail gomb (`server/routes.ts`, `client/src/components/AdminFileDashboard.tsx`)

1. A végpont a bemenet-ellenőrzés után `res.status(501).json({ message: "A tömeges e-mail küldés még nem érhető el." })`; a
   `// TODO` megjegyzés helyére egysoros magyarázat kerül (miért 501).
2. A kliens a nem sikeres választ hibaként mutatja (a meglévő hibakezelő ág; ha nincs, `variant: "destructive"` toast a szerver
   üzenetével), sikerüzenet csak 2xx-re.
3. Új teszt `tests/bulk-email-honest.test.ts`: forrásőr — a `routes.ts`-ben nincs `not yet implemented` sikerválasz, a végpont
   501-et ad.

## J5 — eredménybeküldés újrapróbálása (`shared/request-retry.ts`, `client/src/lib/queryClient.ts`, `client/src/lesson-runtime/resultReport.ts`)

1. Új tiszta függvény `isRetryableRequestError(error)`: a hiba és a `cause` lánc bármely eleme `TypeError` vagy `AbortError` →
   igaz; státuszos hiba: csak 5xx; egyébként hamis. Körkörös lánc ellen védett.
2. `apiRequest` újrapróbálási feltétele ezt használja (a meglévő `hibavadaszat-a.test.ts` A4 forrásőre — két
   `error instanceof TypeError` — változatlanul zöld marad).
3. `resultReport.ts`: `apiRequest(..., { retries: RESULT_REPORT_RETRIES })`, `RESULT_REPORT_RETRIES = 3`.
4. Új teszt `tests/request-retry.test.ts` (tiszta függvény + forrásőr).

## Záró ellenőrzés és szállítás

1. `npm.cmd run check`, `npm.cmd run lint`, `npm.cmd run check:test`, `npm.cmd test` (teljes), a lecke böngészős tesztjei
   (`npx.cmd playwright test tests/lesson-fusion.spec.ts`, PowerShellből).
2. Böngészős próba a számegyenesre és a fejlécekre: a telepítés után az élő `49780f86-…` lecke (a J2 felismerő és a J3 a már
   közzétett leckén is látszik).
3. Atomi commitok szeletenként, PR, zöld CI, összevonás (a tulajdonos állandó felhatalmazása szerint), élő visszaolvasás.
4. Mérés élesben: egy új gyártás (kb. 5 USD) bankideje a mai 862–1113 mp-hez mérve; a naplóban `Bank keresztütközés` sor.
5. `docs/agent-csapdak.md` új bejegyzés, kanban #9 jegyzet és lezárás.
