# Végrehajtási utasítás — Tételgyár T1b: a padló alá eső kapuhibából a bank újraépül (130%-os tartalékkal)

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (T1, G4 — „kivesz és pótol”). Ág: `feat/tetelgyar-t1b-bank-ujraepites` (a #229-re épül).

## Mért kiinduló helyzet (élő, job `416ad01d`, 09:04–09:05)
- A T0 utáni folytatás: lektor újrafutott (kapu → lektor visszaél élesben működött), a kapu részleges javítása 1 tételt javított, 4-et
  „javítatlan, a kapu dönt” (az orkesztrátor futásonkénti kerete elfogyott), a kivétel után: „c4: hiányzó recall kvíz”, „Legalább 45 szöveges
  feladat és 75 kvízkérdés szükséges.” A bank a RÉGI, ~107%-os tartalékkal épült (48/82); a T1 csak új bankra hat.
- Következmény: a kapu újrafuttatása ugyanazon a bankon nem konvergál; a lecke csak új, tartalékos bankkal fejezhető be.

## T1b.1 — új folytatási fajta: `rebuild`
Fájl: `server/studio/step-runner.ts`:
- `resumeKindOf` bemenete kap `gateRecoveryAttempt?: number`; kapu-látogatás + egyező hiba + `GATE_RESUMABLE_ERRORS` esetén:
  `gateRecoveryAttempt` hiányzik/0 → `"gate"` (a kapu újrafut, változatlan); ≥ 1 → `"rebuild"`.
- `retryFailedGate`: `"rebuild"` → `workflowAllowResumeEdge("gate", "animator", …, ["lektor", "gate"])`, majd
  `step: "animator", status: "pending"`, `previousGateError`, `gateRecoveryAttempt + 1`, `bankRebuild: true`; a lecke tanítása és a kör
  változatlan. A bank a T1 kvótáival épül újra: a csomag-lenyomat a kvótát is tartalmazza, ezért a régi csomagok nem jönnek vissza.
- A futásnézet (`oneStepRunView`) és a `resume` útvonal a `gateRecoveryAttempt`-et átadja a `resumeKindOf`-nak.

## T1b.2 — a visszaél a további lépésekre is keretet ad
Fájl: `server/workflows/engine.ts` `workflowAllowResumeEdge(from, to, reason, alsoGrant: string[] = [])`: a `to` és az `alsoGrant` lépések
közül az elfogyott keretűek egyszeri +1 látogatást kapnak (ugyanabban a mentésben, naplózva).

## T1b.3 — tesztek
- `tests/gate-resume.test.ts`: `gateRecoveryAttempt` 0 → `gate`, 1 → `rebuild`.
- `tests/lesson-pipeline-runner.test.ts`: `retryFailedGate` a második kapuhibánál `animator`/`pending`, `bankRebuild: true`, `gateRecoveryAttempt: 2`.
- `tests/lektor-evidence.test.ts`: `gate → animator → lektor → gate → readback` elfogyott animator/lektor/gate kerettel is lefut.
- Parancsok: célzott tesztek, `npm.cmd run check`, `lint`, `check:test`, `build`, teljes `npm.cmd test`.

## T1b.4 — élő E1
Deploy után a `416ad01d` felületről folytatva: az animátor új, tartalékos bankot épít (napló: csomagonként a `taskTarget`), lektor, kapu →
publikál, vagy pontosan megnevezett okkal áll meg. Költség: egy teljes banképítés + egy lektorkör (a tulajdonos 2026-10-15-i engedélyével).
