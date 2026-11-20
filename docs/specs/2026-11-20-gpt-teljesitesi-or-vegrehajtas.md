# Végrehajtás — GPT teljesítési őr

Terv: `docs/specs/2026-11-20-gpt-teljesitesi-or.md`. Ág: `feat/gpt-teljesitesi-or` (a `chore/vak-ellenor-deepseek` `1e564a01` fejére).
Push / PR nincs; nehéz kör (gate:stage, teljes teszt) csak a gépi zárral (`zar-futtat-2.sh`).

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. Bukó tesztek: `scripts/qa/gates/blind-review/completeness.test.mjs` (T1–T5 szintetikus jelentésmintákkal; T6 a hurok mock-modellel;
   T7 record-review; T8 a Codex-burok hamis `codex` futtatóval) — a kód előtt commitolva, bukásuk rögzítve.
3. `scripts/qa/gates/blind-review/completeness.mjs`: `debugPoints(template, goal)`, `checkCompleteness(text, { points, findings })`,
   `closingLine(result)`.
4. `blind-review.mjs`: a `validateReport` `completeness` opciója; a hurok (legfeljebb 3 teljesség-visszautasítás, utána NEM TELJES);
   bizonyíték `completeness`; a `submit_report` séma: `findings[].scenario`, `findings[].fix`.
5. `futtato-kiegeszites.md`: teljesítési szerződés.
6. `record-review.mjs` + `evidence.mjs`: a teljesség-bizonyíték kötelező (kizárólagos módban), a szöveg újraellenőrzése.
7. `codex-complete.mjs`: a Codex CLI-burok.
8. Skill (forrás + tükör), `docs/minosegkapuk.md` egy sora, csapda-bejegyzés.
9. Mutációs ellenpróba (≥ 4 mutáns); `gate:stage` a zárral; fej-hash.

10. Kiegészítés (életjel): `stream.mjs` (streaming csend-óra), `heartbeat.mjs` (szívverés + díjmentes felügyelő), a `codex-complete.mjs`
    beragadás-felismerése (`watchedExec`), hálózati hurok, „tokens used” olvasás; tesztek: `liveness.test.mjs`.

11. Kiegészítés 2 (néma kilépés hibajegye, terv: `docs/specs/2026-11-20-gpt-teljesitesi-or.md` „Kiegészítés 2”):
    `exit-trace.mjs` (`createExitTrace`, `lockWaitReporter`); `heavy.mjs` `acquireMachineLock({ onPoll })`; `tools.mjs`
    `ctx.onLockPoll` / `onToolStart` / `onToolEnd`; `blind-review.mjs` `fail()`, `trace.install()`, percenkénti zárvárási sor +
    szívverés; tesztek: `exit-trace.test.mjs` (T13–T14, a valódi futtató argumentum-hibás kilépése is), `rules-guard.test.mjs`
    bekötés-őr; mutációs ellenpróba (≥ 4 mutáns); skill 7–8. szakasz, csapda-bejegyzés.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 · [x] 6 · [x] 7 · [x] 8 · [~] 9 (mutáció 13 / 13; gate:stage a kapu-sorban) · [x] 10
- [x] 11 (mutáció 8 / 8; gate:stage a kapu-sorban)
