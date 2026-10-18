# Tanulói profil — S2 Hozzárendelés — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-tanuloi-profil.md`. Előfeltétel: S1, a `learners` / `learner_activity` tábla és a `resolveLearner`.
Munkakönyvtár: `source/`.

## 1. Keret-token
- **`client/src/pages/Preview.tsx`:** ha van `getLearnerToken()`, a `renderUrl` kiegészül: `?lt=<token>`. Ez érvényes a keretre és az
  „új lapon” gombra is.
- **`server/routes.ts` `GET /dev/:id`:**
  - `resolveLearner(req.query.lt)`;
  - érvényes tanulónál `learner_activity` `view` sor (anyagonként és tanulónként óránként egyszer, a meglévő `materialViewDedup`
    kulcsával: `learner|<id>|<fileId>`);
  - a HTML-anyag oldalába a `<head>` után beinjektálva `<script>window.__websuliLearner="<token>"</script>` (`JSON.stringify`,
    `<` → `\u003c`), a tiszta `withLearnerScript(html, token)`-nel (`server/lib/material-capture.ts`).
  - A PDF-ág változatlan; a megtekintés ott is rögzül.

## 2. Régi anyag eredménye
- **A beinjektált szkriptek** (`globalEmailScript` → `sendResultEmail`, a `MATERIAL_CAPTURE_SCRIPT` → `post`): a kérés törzse
  `learner: window.__websuliLearner` mezőt kap, ha van.
- **`normalizeMaterialResult`:** opcionális `learner` (string, legfeljebb 120 karakter), egyébként változatlan.
- **`POST /api/material-result`:** `resolveLearner(value.learner)`.
  - **Érvényes tanulónál:**
    - a kézbesített tárgy `"<keresztnév> – <tárgy>"`;
    - kézbesítéskor `learner_activity` `result` sor: `percent` = a törzs első `NN%` értéke (0–100), `summary` = az anyag címe
      (legfeljebb 200 karakter).
  - **Rögzítés helye:**
    - közvetlen küldésnél a sikeres kézbesítés után;
    - automatikusnál az összevárt kézbesítéskor (egyszer).
- **Tiszta segédfüggvények:**
  - `percentOf(body)`;
  - `withLearnerSubject(payload, firstName)`.

## 3. Stúdió-lecke eredménye
- **`client/src/lesson-runtime/resultReport.ts`:** a törzs `learner: getLearnerToken()` mezőt kap, ha van.
- **`shared/lesson-result-email.ts`:**
  - a `resultRequestSchema` mindkét ága opcionális `learner` mezőt kap (string, legfeljebb 120 karakter);
  - a `buildResultEmail` opcionális `learnerFirst`-et fogad, és a tárgy `[WebSuli eredmény] <keresztnév> – <cím> — …` lesz.
- **`server/lesson-result-email.ts`:**
  - **A tanuló neve:**
    - bejelentkezett felhasználónál változatlan;
    - különben `resolveLearner(body.learner)`, a név a teljes név, a tárgyba a keresztnév kerül.
  - **Rögzítés:** a `sendLessonResult` `learnerId`-t is kap, és amikor a kör sora újonnan jön létre (`returning`), `learner_activity`
    `result` sort ír (`material_id` = a lecke `htmlFileId`-ja, a százalék, a cím és a rész).

## 4. Tesztek
- **`tests/learner-attribution.test.ts`:**
  - `withLearnerScript`: a `<head>` utáni beszúrás, fej nélkül az elejére, a `</script>` nem törhet ki;
  - `percentOf`;
  - `withLearnerSubject`;
  - `normalizeMaterialResult` a `learner`-rel (hosszkorlát);
  - `resultRequestSchema` a `learner`-rel;
  - `buildResultEmail` a keresztnévvel.
- **`tests/material-result-capture.spec.ts`:** a `window.__websuliLearner` beállítása után az automatikus beküldés törzsében
  szerepel a `learner`.

## 5. Ellenőrzés
- `check`, `check:test`, `lint`, `test`, `build`, a capture-spec.
- **Élesítés után:** saját párosítás (a próbalevél linkjével nem lehet, az token nélküli) helyett a tanulói link olvasásos
  előállítása szkripttel, mobil Playwright: megnyitás `?t=`-vel, kvíz, a beküldés elfogva.
  - A beküldésben szerepel a `learner`.
  - Az élő végpont hamis tokenre névtelenül kezel.
