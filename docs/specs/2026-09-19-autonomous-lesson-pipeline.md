# Spec: autonóm tananyagkészítő ökoszisztéma (feltöltés + internetes készítés)

> Dátum: 2026-09-19 · Szerző: Claude (Fable 5.1) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás 2026-09-19: „a cél, hogy működjön az alkalmazáson belüli teljes tananyagkészítő ökoszisztéma")

## 0. Végső cél (amit a javítás elér)

A tanár az alkalmazásban feltölt forrást (JPG/PNG fotó, PDF, DOCX, TXT) vagy internetes
készítési utasítást ad, egy gombot nyom, és **kézi visszaigazolás nélkül** kész, ellenőrzött,
közzétett és visszaolvasott v7.4 fúziós tananyagot kap. Minden megállás vagy `done`
(látható minőségi jelzéssel), vagy valódi, cselekvésre alkalmas hiba. A „forrásellenőrzés
szükséges" parkolás az egylépéses útvonalon megszűnik.

Mérhető: a 2026-09-19-i három parkoló éles futás térképe (`08af437e…`, `84bf9b03…`,
`01f52aca…`) automatikus kurálással jóváhagyódik és leckévé válik; egy valódi JPG- és egy
valódi PDF-forrású helyi futás `done`-ig ér; a dirty munka teljes egészében beolvasztva.

## 1. Cél

1. Az egylépéses (`POST /api/studio/lessons/one-step`) futás forrásellenőrzése autonóm:
   determinisztikus idézet-újrapozicionálás után a még igazolatlan kulcsfogalom **látható
   marad (pending), de nem tanítjuk és nem blokkol**; a térkép jóváhagyódik, a lecke elkészül,
   a hiány a futás `detail`-jében és a job `qualityNotes` listájában jelenik meg.
2. A lektor lépés túlélje az xAI időtúllépést: külön családú tartalék-modell (OpenRouter,
   `anthropic/claude-sonnet-5`), a Studio-lektornál és a webes tartalmi lektornál is.
3. A bankcsomag-gyártás javítási kerete 2-ről 3 kísérletre nő csomagonként.
4. A PDF-feltöltés ne bukjon nyers `Invalid PDF structure.` hibával: bájt-alapú felismerés
   (valójában kép → kép-útvonal), sérült/titkosított PDF → OCR-átirat, végső esetben érthető
   magyar hiba.
5. A 2026-09-14-i hét dirty téma (bank-binding-recovery, lektor-skill-gate, lesson-dev-csp,
   one-step-termination, real-learning-tests, resume-http-acceptance, scheduled-publishing-db)
   beolvasztása; a spec nélküli like-CSRF-kivétel megtartva, de Origin-allowlisttel szigorítva.

## 2. NEM cél

- A kézi „Csak tudás-térkép" kurálási út (`canApprove`) gyengítése — változatlan.
- A D1-szabály gyengítése: igazolatlan idézetű kulcsfogalom NEM kerül tanításba.
- Új modellek a szerzői/pedagógus lépésben; promptverzió-emelés.
- A webes készítés keresőjének cseréje (Anthropic web_search marad).
- Frontend-átalakítás; csak a meglévő `detail`/`qualityNotes` megjelenítés használata.

## 3. Mért gyökérokok (éles DB, 2026-09-19, csak olvasás)

| Tünet | Gyökérok | Bizonyíték |
| --- | --- | --- |
| 3 futás `parked: Forrásellenőrzés szükséges: Még N fogalom átnézésre vár` | `lesson-pipeline-routes.ts:429` a `canApprove` kapura parkol; a pending kulcsfogalmak 4/5-e OCR-zaj (`burokelevelek`↔`buroklevelek`, `főgyökerzete`↔`főgyökérzete`), 1/5 valódi parafrázis | `one_step_runs` 09:42/10:32/10:38; `km_concepts` pending_core 1–3 / 39–49 |
| `Váratlan hiba történt` a lektornál | `[xAI] Request timed out` 480 s után, `FALLBACK_MODELS.lektor` nincs | `studio_jobs 434d1dcb`, `models.ts:64-71` |
| `A 1. fejezet bankcsomagja a javító kör után sem megfelelő: methods=3, tasks=10, quiz=18` | csomagonként 2 kísérlet (`experience-builder.ts:161`), 36–48 fogalmas térképen sok csomag | `studio_jobs 41a94054, 222202f1, 4f853db8` |
| `Invalid PDF structure.` | `document-source.ts:34` nyers pdfjs-hiba, nincs tartalék | `one_step_runs a1707ade` |
| Webes: `A célzott javító modellhívása nem fejeződött be` | lektor-hívás (`web-teaching-review.ts:122`) ugyanaz a grok időtúllépés, nincs tartalék | `lesson_workflow_runs 0b37a30f` |
| PDF (valódi próbafutás 2026-09-19, 1645 s): `A fúziós lecke tanítása hiányos: 1 fogalom-címkét a blokk saját szövege nem támaszt alá … talaj-kialakulasa a(z) 6. animate blokkon` | az animációs blokk felirata „talajképződés", a fogalom neve „A talaj kialakulása" (szinonima); a `#196` szóegyezés téves pozitívja egy kozmetikai blokkon, a kapu 3 szerzői kör után buktatott | `studio_jobs 3ed5ca90`, `lesson_workflow_runs be202c1d` (author×3 → gate:error) |
| Tulajdonosi éles térkép (49 fogalom, kurált futás 2914 s): `A lektor 1 tartalmi javítást kér: A kvíz a föld alatti fogyasztott részt kizárólag gyökérnek adja…` | a lektor körönként új, egyetlen banktételre vonatkozó blokkolót talált; a körlimitnél (round 2) a maradó bank-blokkoló hard-fail, pedig csak célzott bankcsere kellene, nem szerzői újraírás | `studio_jobs b4d94132` (author×3, lektor_notes `experience.quiz.3`) |
| Webes 2. próbafutás (1194 s): `A célzott tartalmi javítás után további ellenőrzés szükséges…` | a lektori javítócsomag egy banktétele a determinisztikus kapun bukott (`mintaválasz nem kap teljes pontot`), ezért a TELJES csomag — a jó szövegjavításokkal együtt — elveszett, és egy kör elfogyott a 3-ból | `ai_generation_requests 33ed1235` diagnostics #6 |
| Webes (valódi próbafutás 2026-09-19, 1001 s): `…automatikus javítás után sem készült el: 1. fejezet: hiányzó tanítási szemléltetés…` | a szerzői kör (`web-research-runner.ts` `web-author-html`) csak a szerkezetet ellenőrzi; a szemléltetés-kapu (`verify-html-teaching.ts` kártyasor-szabály: figcaption ≥20 + ≥2 kártya félkövér címkével) csak a bankgyártás UTÁN fut, javítókör nélkül; a szerző címke nélküli nyilas lépéssort írt | `ai_generation_requests 0aa2435b` (candidate: 4 figure, 1 svg, 0 címkés kártya) |

Eredmény 30 napra: upload 1 done / 5 error / 3 waiting; web 1 done / 1 error.

## 4. Érintett fájlok

- `source/server/studio/verbatim.ts` — `relocateQuote()` determinisztikus újrapozicionálás.
- `source/server/studio/source-transcript.ts` — `repairSourceQuotes` modellkör előtt relokáció.
- `source/server/studio/auto-approve.ts` — `autonomousApprovalDecision()`.
- `source/server/studio/lesson-pipeline-routes.ts` — sourceCheck ág: relokáció DB-soron,
  autonóm jóváhagyás, hiányjegyzet a run `detail`-be és a job `qualityNotes`-ba.
- `source/server/studio/step-runner.ts` — `loadMap`/fogalomjavító csak `kept|edited` fogalmat tölt.
- `source/server/ai/models.ts` — `FALLBACK_MODELS.lektor = "anthropic/claude-sonnet-5"`.
- `source/server/studio/web-teaching-review.ts` — `callTeachingReviewer` tartalék-modell.
- `source/server/studio/experience-builder.ts` — `attempt < 3`.
- `source/server/studio/document-source.ts` — PDF tartalék-lánc.
- `source/server/routes.ts` — like-lookup CSRF-kivétel Origin-allowlisttel.
- `source/tests/…` — új/ bővített tesztek (ld. 7.).
- `docs/lesson-improvement.md` — a pending kulcsfogalom szabálya az egylépéses úton.
- `.gitignore` — `.playwright-mcp/`, gyökér `test-results/`.

## 5. Rögzített döntések

- **Relokáció küszöbe:** normalizált szöveg, szóhatárra igazított ablak, hasonlóság
  (Levenshtein-arány) ≥ 0,90 és legalább 3 szó; az idézet a forrás TÉNYLEGES részletére cserélődik.
  A „hagymafej" parafrázis (11/12 szó, de más mondat) küszöb alatt marad → pending.
- **Autonóm jóváhagyás:** elutasított fogalmak kizárva; ha legalább 1 kulcsfogalom igazolt ÉS az
  igazolt (kept|edited) fogalmak aránya ≥ 60 % → jóváhagyás; különben `error` érthető okkal
  (olvashatatlan forrás). Pending kulcsfogalom NEM kerül a jobnak átadott fogalomlistába.
- **Kézi út változatlan:** `canApprove` és a KnowledgeMapEditor pending-megjelenítése marad;
  a pending fogalom ott utólag javítható, majd célzott fogalomjavítás vihető rá.
- **Lektor tartalék:** csak modellhívás-hibára (`StepModelError`), sémasértésre nem; a
  `assertDistinctFamilies` őr a tartalékra is fut (anthropic ≠ openai).
- **PDF:** magic-bytes (`%PDF`, JPEG `FFD8`, PNG `89504E47`, WebP `RIFF…WEBP`, GIF `GIF8`);
  kép esetén a fájl `kind: "image"` lesz helyes MIME data-URL-lel; pdfjs-hiba esetén
  `transcribePdf` (vision OCR); annak hiányában/hibájánál magyar hiba a pdfjs-üzenettel.
- **Like-lookup CSRF:** a két csak-olvasó POST kikerüli a szinkronizáló-tokent, de az
  Origin/Referer-allowlistet NEM (a dirty teszt ennek megfelelően pontosítva — spec-változás).

## 6. Edge case-ek

- Több azonos nevű fájl: `attachSourceTranscripts` már hibát ad — változatlan.
- Relokáció több találattal: a legjobb hasonlóságút választjuk; egyenlőnél az elsőt.
- Idézet hosszabb a forrásnál: relokáció kihagyva, marad not_found.
- Minden kulcsfogalom pending (OCR-szemét): `error`, nem üres lecke.
- Cache-találat régi draft térképre: a sourceCheck ág ugyanúgy relokál és dönt (DB-sor alapján).
- Lektor primer és tartalék is hibázik: a hiba mindkét okot tartalmazza; timeout-visit nem
  fogyasztja a körkeretet (dirty `lesson-workflow.ts:65-68`).
- PDF valójában JPG: OCR-útvonal, a fájlnév marad, `kind` képre vált.

## 7. Elfogadási kritériumok (EARS)

- WHEN egy kulcsfogalom idézete csak OCR-zajban tér el a forrástól THEN `relocateQuote` a
  forrás tényleges részletét adja vissza és `checkVerbatim` ezután `ok`.
- WHEN egy idézet parafrázis (más mondat) THEN a relokáció `null`, a fogalom pending marad.
- WHEN az egylépéses futás térképén relokáció után is marad pending kulcsfogalom, de ≥1
  kulcsfogalom igazolt és az igazoltak aránya ≥ 60 % THEN a térkép `approved`, a job elindul, a
  jobnak átadott fogalomlista a pending fogalmat NEM tartalmazza, a run `detail` és a job
  `qualityNotes` megnevezi a kimaradt fogalmakat.
- WHEN a kézi útvonalon pending fogalom van THEN `canApprove` továbbra is `ok:false`.
- WHEN a lektor primer modellje `StepModelError`-ral bukik THEN a runner a
  `FALLBACK_MODELS.lektor` modellel egyszer újrapróbál; sikeres válasz esetén a lépés `ok`.
- WHEN a webes tartalmi lektor primer hívása `StepModelError` THEN a tartalék-modell fut.
- WHEN egy `animate` blokk `coversConceptIds` címkéjét a blokk saját szövege (felirat + lépések)
  nem alapozza meg THEN az animátor lépés a címkét determinisztikusan eltávolítja
  (`stripUngroundedAnimateLabels`), a címke nélkül maradó blokkot elhagyja, naplózza; a tanító
  blokkok megalapozottsága változatlanul a kapun mérődik. Érintett: `server/studio/grounding.ts`,
  `server/studio/step-runner.ts`, `tests/studio-grounding.test.ts`.
- WHEN a Studio-lektor a szerzői körlimitnél (round ≥ `MAX_AUTHOR_ROUNDS`) csak `experience.*`
  útvonalú (banktételes) blokkolót hagy THEN egyszer (és csak egyszer, `bankOnlyRepairRound`) az
  animátor bank-javító köre fut a megnevezett tételekre szerzői újraírás nélkül (workflow: animator
  `after` tartalmazza a lektort; animator/lektor/gate `maxVisits` 4; `MAX_CHAIN_STEPS` +3), utána a
  lektor dönt: 0 blokkoló → kapu; maradó blokkoló → változatlan hiba. Tanítási blokkoló mellett
  nincs bank-only kör. Érintett: `server/studio/pipeline.ts`, `server/studio/step-runner.ts`,
  `shared/lesson-workflow.ts`, `tests/pipeline-state.test.ts`, `tests/lesson-pipeline-runner.test.ts`,
  `tests/lektor-resume-progress.test.ts` (négy tartalmi review a keret).
- WHEN a webes lektori javítócsomag banktétele a determinisztikus kapun bukik, de a szövegcserék
  önmagukban átmennek THEN a szövegcserék érvénybe lépnek (`salvageTeachingEdits`, a kapu fail-closed
  marad), a bank-elutasítás oka a következő javítókör bemenetébe kerül (`previousBankRejection`);
  a javítókörök száma `REVIEW_REPAIR_ATTEMPTS` = 3 (négy review). Érintett:
  `server/studio/web-teaching-repair.ts`, `tests/web-teaching-repair.test.ts`.
- WHEN a webes lektori javítócsomag `before` horgonya csak whitespace-ben (sortörés, behúzás) tér el
  a nyers HTML-től THEN `locateAnchor` egyetlen egyedi, egy szövegcsomóponton belüli találatként
  illeszti; WHEN a csomag formailag hibás (üres, hiányzó horgony, hatókör) THEN a pontos hibával
  azonnal újrakérés jön, legfeljebb `FORMAT_RETRIES` = 2 alkalommal futásonként, review-kör
  fogyasztása nélkül (mérve: web run 3 két csomagja formai okból bukott, 846 s). Érintett:
  `server/studio/web-teaching-repair.ts`, `tests/web-teaching-repair.test.ts`.
- WHEN a webes tartalmi lektor javítókör utáni újraellenőrzést végez THEN megkapja az előző
  véleményt (`previousReview`) és a konvergencia-szabályt: javított hibajegy nem kerül elő újra, új
  hibajegy csak tényhiba / forrásellentmondás / nem igazolható állítás / hiányzó tanítás /
  tanítatlan tudásra épülő kérdés lehet; korábban nem kifogásolt fejezetre új explanation_depth
  vagy age_and_added_value nem vezethető be (mérve: 4 webes futás, mind ezeken bukott a tényszerű
  kritériumok teljesülése után). WHEN a korlátos javítókörök után KIZÁRÓLAG explanation_depth és/vagy
  age_and_added_value marad nyitva THEN a tananyag közzétehető, a lektor megjegyzései
  `reviewEvidence.warnings`-ként mellékelve (`assertTeachingReviewEvidence` ezt és csak ezt fogadja
  el); factual_accuracy / source_coverage / question_grounding hiba továbbra is megállít. A javító
  prompt kéri a hogyan/miért kifejtést mondatbővítéssel. Érintett: `web-teaching-review.ts`,
  `web-research-runner.ts`, `web-teaching-repair.ts`, tesztek.
- WHEN a Studio-lektor javító kör után (round ≥ 1) fut THEN a bemenete és promptja tartalmazza az
  előző kör blokkoló jegyzeteit (`previousBlockers`) és a konvergencia-szabályt; WHEN olyan
  fejezetre ad `coverage_gap` blokkolót, amelyet az előző kör nem blokkolt THEN a runner azt
  determinisztikusan `warn`-ra minősíti (`applyLektorConvergence`, a jegyzet „Késői fedettségi
  jelzés" előtaggal megmarad); `source_conflict` és az ismételten jelzett fejezet hiánya blokkoló
  marad (mérve: tulajdonosi térkép 3 futása, jobs b4d94132/6cb1bc89/6cc5930d — minden körben más
  fejezetre új core-hiány). Érintett: `server/studio/lektor.ts`, `server/studio/step-io.ts`,
  `server/studio/step-runner.ts`, `tests/lektor-d1.test.ts`, `tests/lesson-pipeline-runner.test.ts`.
- WHEN egy nyílt feladat mintaválasza minden kötelező csoportot és a minimális szószámot
  teljesíti, de csak a kötőszó-heurisztika (`needsSentence`) miatt nem teljes pont THEN a
  bankcsomag-ellenőrzés a feladatot `needsSentence: false`-ra állítja (a tanuló és a minta ugyanúgy
  értékelődik), nem bukik a csomag (mérve: tulajdonosi térkép, job 6cb1bc89, 3 kísérlet egy
  feladaton). Érintett: `server/studio/experience-builder.ts`, `tests/lesson-experience.test.ts`.
- WHEN a webes szerző HTML-jének valamely fejezetében nincs a kapunak megfelelő szemléltetés THEN a
  szerzői kör (`verifyTeachingVisuals`) MÉG a bankgyártás előtt a fejezet sorszámával kéri a
  javítást (legfeljebb 2 javítókör), és a `HTML_TEACHING_CONTRACT` pontosan a kapu szabályát
  írja le (figcaption ≥20 karakter + ≥2 félkövér címkés, ≥20 karakteres kártya, vagy SVG/kép/lista/táblázat).
  Érintett fájlok: `server/improve/verify-html-teaching.ts`, `server/studio/web-research-runner.ts`,
  `shared/lesson-quality.ts`, `tests/lesson-teaching-quality.test.ts`.
- WHEN egy bankcsomag 3. kísérletre válik érvényessé THEN a lépés sikeres (2. bukása után nem áll meg).
- WHEN egy `kind:"pdf"` fájl bájtjai JPEG/PNG THEN a normalizálás `kind:"image"` fájlt ad
  helyes data-URL-lel, hiba nélkül.
- WHEN a pdfjs nem tudja megnyitni a PDF-et és van `transcribePdf` THEN az átirat OCR-ből jön.
- WHEN `POST /api/materials/likes/batch` engedélyezett Originről érkezik CSRF-token nélkül THEN
  nem 403; WHEN nem engedélyezett Originről THEN 403.
- `npm run check`, `check:test`, `lint`, `npm test` mind 0 kilépési kód; CI zöld; Vercel+Render deploy READY.

## 8. Kockázatok / visszavonás

- Relokáció túl laza → hamis idézet: küszöb 0,90 + szóhatár + 3 szó; teszt a parafrázisra.
- OpenRouter-Anthropic tartalék nem elérhető éles kulccsal: a runner hibaüzenete mindkét okot
  adja; a primer útvonal változatlan. Visszavonás: `FALLBACK_MODELS.lektor` törlése.
- Több csomag-kísérlet több költség: csak sikertelen csomagnál fut.

## 9. Végrehajtási utasítás

`docs/specs/2026-09-19-autonomous-lesson-pipeline-vegrehajtas.md`
