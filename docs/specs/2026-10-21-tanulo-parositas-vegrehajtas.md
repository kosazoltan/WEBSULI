# Tanulói párosítás — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-tanulo-parositas.md`.

1. **`shared/learner-report.ts` `inactivityAlertEmail`:** tárgy „… profiljához 3 tanítási napja nem érkezett tevékenység”; a szöveg az ok
   (párosítatlan eszköz, Spam / Promóciók) és a teendő (Tanulók fül → QR-kód / párosító link; a noreply@websuli.vip a névjegyekhez).
2. **`client/src/components/LearnersPanel.tsx`:** „Párosító QR-kód” gomb → a `qrcode` csomaggal a link QR-képe (dataURL), bezárható.
3. **`server/lib/material-result.ts` / az eredménylevél:** vendég esetén egy útmutató bekezdés (párosítás a Tanulók fülön).
4. **Teszt:** a riasztás tárgya / szövege; a vendég-útmutató.
