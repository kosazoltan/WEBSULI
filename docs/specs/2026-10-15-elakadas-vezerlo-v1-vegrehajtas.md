# Végrehajtási utasítás — Elakadás-vezérlő V1: hiba-ujjlenyomat és döntési lépcső (tiszta, tesztelt)

Terv: `docs/specs/2026-10-15-elakadas-vezerlo.md` (V1). Ág: `feat/elakadas-vezerlo-v1` (a `main`-ről).

## V1.1 — `server/studio/recovery-planner.ts` (új, tiszta modul, DB és modell nélkül)
- `export type RecoveryStrategy = "retry-provider" | "review" | "gate" | "rebuild-targeted" | "rebuild-full" | "author-repair" | "remanufacture" | "ask-owner";`
- `export type RecoveryStep = { strategy: RecoveryStrategy; fingerprint: string; failing: number; at: number };`
- `export function failureFingerprint(error: string): { cls: string; key: string; failing: number }`
  - `cls`: `provider` (modellhívás-hiba / időtúllépés), `evidence` (lektor-bizonyíték), `bank-floor` (limit/egyválasztós kapuhiba),
    `bank-packet` (csomag a javítókör után sem jó), `other`.
  - `key`: `cls` + a hibás útvonalak rendezett, egyedi halmaza (`experience.(tasks|quiz|methods)[n]`, `sections[n]`, `N. fejezet`) + a padló-hiányok
    (`cX: hiányzó recall|apply kvíz`, `45/75`) — a szöveg többi része nem számít.
  - `failing`: a hibás útvonalak száma.
- `export const RECOVERY_LADDER: Record<cls, RecoveryStrategy[]>`:
  - `provider`: `["retry-provider", "retry-provider", "remanufacture"]`
  - `evidence`: `["review", "rebuild-full", "remanufacture"]`
  - `bank-floor`: `["gate", "rebuild-targeted", "rebuild-full", "author-repair", "remanufacture"]`
  - `bank-packet`: `["retry-provider", "rebuild-targeted", "author-repair", "remanufacture"]`
  - `other`: `["author-repair", "remanufacture"]`
- `export function planRecovery(input: { error: string; history: RecoveryStep[] }): { strategy: RecoveryStrategy; reason: string; fingerprint: string }`
  - A lépcső következő foka, amelyet az adott osztályban még NEM használtunk (a `retry-provider` legfeljebb kétszer); ha minden fok elfogyott →
    `ask-owner` magyar indoklással (az utolsó ujjlenyomat hibás útvonalaival).
  - Haladás: ha az utolsó lépés óta a `failing` csökkent ÉS az osztály változatlan, a következő fok ugyanaz maradhat egyszer még (az utolsó stratégia
    hatott) — kivéve `remanufacture` (soha nem ismétlődik).
- `export function recoveryReason(step)`: a felület szövege stratégiánként (magyarul).

## V1.2 — bekötés (csak tájékoztatás, végrehajtás a V2–V4-ben)
- `server/studio/lesson-pipeline-routes.ts` `oneStepRunView`: hibánál `nextRecovery: { strategy, reason }` a `planRecovery` szerint
  (`history` = `job.output.recovery ?? []`).
- `client/src/components/studio/SourceUploadForm.tsx`: a piszkozat alatt „A program következő lépése: <reason>”.

## V1.3 — tesztek (`tests/recovery-planner.test.ts`, új)
- Ujjlenyomat: a 416-os valós hibaüzenet → `bank-floor`, a 4 útvonal + `c4: hiányzó recall kvíz` + `45/75`; a sorrend és a szöveg többi része nem számít.
- Lépcső-mátrix osztályonként: üres történet → első fok; minden fok egyszer; `retry-provider` kétszer; elfogyott → `ask-owner` indoklással.
- Haladás: csökkenő `failing` mellett az utolsó stratégia egyszer ismételhető; a `remanufacture` soha.
- Véges: bármely történetre legfeljebb `RECOVERY_LADDER[cls].length + 1` különböző lépés után `ask-owner`.
- Parancsok: `npx.cmd tsx --test tests/recovery-planner.test.ts`, `npm.cmd run check`, `lint`, `check:test`, `build`, teljes `npm.cmd test`.
