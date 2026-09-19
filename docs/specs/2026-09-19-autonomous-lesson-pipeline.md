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
