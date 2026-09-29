# Kivonatolás: minden forrásfájl kapjon fogalmat — a rövid füzetlapot a hosszú webes szöveg ne szorítsa ki (2026-09-29)

## Kiváltó ok (élő mérés)
„Mezopotámia”, 5. o., kombinált forrás: egy kézírásos füzetfotó és 3 letöltött oldal. Studio-map `9c02a5bb`, anyag `8ed51fa9`:
- a térkép 49 fogalmából EGY SEM a füzetfotóból jött;
- hiányzik a füzetlap „Babilon városa”, a társadalom rétegei (papkirályok, előkelők: papok és katonák, parasztok és
  kézművesek) és „Ázsia, Közel-Kelet”;
- helyettük webes többlet jelent meg (Istár-kapu, Bábel tornya).

Csak a fotóval a füzetlap fogalmai rendben megvoltak (map `3d37c434`).

## Gyökérok (kódból)
- `server/studio/run-extraction.ts:185`: EGY közös kivonatoló hívás minden fájlra, `max_completion_tokens: 8192` (`:147`).
  Csak a `finish_reason: "stop"` válasz fogadható el (`:150`), a prompt (`:119-135`) nem kéri, hogy minden fájlból
  legyen fogalom, és nincs fájlonkénti kvóta.
- `server/studio/extractor.ts:209-224` `completeSourceCoverage`: egy általános pótló kör, fájlonkénti fedettség-ellenőrzés nincs.
- Következmény: a hosszú webes szövegek töltik ki a kimeneti keretet, a rövid forrás kimarad.

## Cél
Minden forrásfájlhoz, amelyből tanítható fogalom nyerhető, legyen fogalom a térképen.

## Nem cél
A kivonatoló modell, a prompt-szerződés, a témafókusz és a kapuk változatlanok.

## Döntés
- A `completeSourceCoverage` egy opcionális `perFile(file, existing)` pótlót kap. Az általános kör után minden olyan
  fájlra, amelynek egyetlen fogalma sincs (`sourceRef.file`), egy CSAK arra a fájlra szóló kivonatoló hívás fut, saját
  kimeneti kerettel. A meglévő fogalmak listáját duplikáció-szűrésre megkapja.
- A pótlás csak az adott fájlra hivatkozhat (`sourceRef.file === file.name`), egyébként hiba, mint az általános körben.
  Az azonosító-ütközést a meglévő szuffix-szabály kezeli.
- Ha a fájlból a célzott hívás után sem jön fogalom (pl. tartalom nélküli oldal), a futás megy tovább. A „coverage”
  megfigyelés ekkor is rögzül.
- `run-extraction.ts`: a `perFile` = `callExtractorModel([file], scope, systemPrompt, model, undefined, existing)`.

## Elfogadás (EARS)
- **E1** Ha az általános kör után egy fájlnak nincs fogalma, a `completeSourceCoverage` SHALL egy csak arra a fájlra szóló pótlást kérni, és az eredményt beépíteni (teszt; a régi kódon a fájl fogalom nélkül marad).
- **E2** Fedett fájlra SHALL NOT célzott hívás indulni (teszt).
- **E3** A más fájlra hivatkozó célzott pótlás SHALL hibát adni (teszt).
- **E4** Kapuk zöldek; élő újramérés a kombinált forrással: a füzetlap fogalmai (Babilon városa, társadalmi rétegek, Ázsia/Közel-Kelet) a térképen vannak.
- A kivonatolás cache-kulcsa (`EXTRACTION_VERSION`) `source-ledger-7-file-coverage`-re emelkedik, így ugyanazok a
  forrásfájlok nem a régi, hiányos térképet kapják vissza.
