# Tanulói párosítás — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-tanulo-parositas.md`.

1. **`shared/learner-report.ts` `inactivityAlertEmail`:** tárgy „… profiljához 3 tanítási napja nem érkezett tevékenység”; a szöveg az ok
   (párosítatlan eszköz, Spam / Promóciók) és a teendő (Tanulók fül → QR-kód / párosító link; a noreply@websuli.vip a névjegyekhez).
2. **`client/src/components/LearnersPanel.tsx`:** „Párosító QR-kód” gomb → a `qrcode` csomaggal a link QR-képe (dataURL), bezárható.
3. **`server/lib/material-result.ts` / az eredménylevél:** vendég esetén egy útmutató bekezdés (párosítás a Tanulók fülön).
4. **Teszt:** a riasztás tárgya / szövege; a vendég-útmutató.

## Kiegészítés — párosítási útmutató e-mailben

Terv: `docs/specs/2026-10-21-tanulo-parositas.md` („Kiegészítés — párosítási útmutató e-mailben”).

5. **`shared/pairing-guide.ts` (új, tiszta):** `childPairingGuideEmail({ firstName, pairLink })` és
   `parentPairingGuideEmail({ names })` → `{ subject, html }`; minden név / link escape-elve.
6. **`server/learner-reports.ts`:** `sendPairingGuides(send = defaultSend)` — tanulónként a `learnerTokenFor`-ral aláírt link
   (`getBaseUrl()/?t=…`), a tanuló aktív `extra_email_addresses` címeire a gyereklevél, majd az admin-címzetteknek egy szülőlevél;
   címenkénti hibatűrés; visszatér `{ children, parents, failed }`.
7. **`server/routes.ts`:** `adminRouter.post("/learners/pairing-guide")` → `sendPairingGuides()`.
8. **`client/src/components/LearnersPanel.tsx`:** „Párosítási útmutató küldése” gomb (megerősítés, CSRF), eredmény a toastban.
9. **Teszt:** a két levél tartalma (gomb-link, lépések, „Szia, …!”, Spam, nincs link a szülőlevélben, escape) + a küldő a címzetteket
   és a hibatűrést (befecskendezett `send`, adatbázis nélkül a tiszta részre).
