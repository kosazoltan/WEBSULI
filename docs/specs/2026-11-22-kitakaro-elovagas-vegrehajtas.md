# Végrehajtás: elővágás a főági kitakaró előtt

> Terv: `docs/specs/2026-11-22-kitakaro-elovagas.md` · Ág: `fix/kitakaro-elovagas` (origin/main 114eaa63-ról)
> Sorrend: T1 tesztek (bukók a főági kódon) → T2–T4 kód → T5 ellenőrzés. Atomi commitok, üzenet fájlból; regex csak Edit / Write
> eszközzel (C-24).

## T1 — Tesztek előbb

- `scripts/qa/gates/kitakaro-main-baseline.mjs` (+ `.d.mts`): a főági kapu-`redact`, külső `maskSecrets` és képgyártói `redact`
  változatlan másolata (a #521 ágáról, a főági sorokkal `diff`-fel egyezik).
- `lib.test.mjs`: 300 000 / 20 M ellenséges bemenet < 1 s; a vágási ponton átnyúló Bearer / ghp / e-mail / DB-URL (szóközzel és
  sortöréssel tagolt kitöltés) 6 karakteres darabja sem marad; korláton belül bájtra a főági kimenet.
- `external-review.test.mjs`: 20 M AIza `maskSecrets` nem dob; `maskClip` (160 / 400 / 600) vágáson átnyúló kulcs / más AIza /
  Bearer / e-mail nélkül, a kimenet a főági előtagja; rövid bemeneten bájt-egyezés; `generate` retry-napló.
- `design-assets.test.ts`: `redactClip` ugyanígy (300); `requestImage` 20 M törzzsel.

## T2 — `scripts/qa/gates/lib.mjs`

`REDACT_CAP = 32 * 1024`; `capTail(text)`: a korlát felett az utolsó 32 KB, a félbevágott első sor (ha van sortörés), különben a
vágáson átnyúló token-futás kimarad, jelzősor elöl; `redact` először ezt hívja, utána a változatlan főági ciklus.

## T3 — `scripts/qa/gates/external-review.mjs`

`maskSecrets` AIza-minta `{20}[…]*`; új `maskClip(s, key, max)` (`n + max(64, kulcshossz)` forrás, vágáson átnyúló kulcs és
token-futás elhagyva, majd `maskSecrets`, majd `slice`); a vágott hívók (`.slice(0, 400 / 600 / 160)`) erre állnak.

## T4 — `source/scripts/design-assets/lib.ts`

Új `redactClip(text, key, max)` ugyanígy; a `requestImage` hibaága ezt hívja (300).

## T5 — Ellenőrzés

`node --test scripts/qa/gates/*.test.mjs`; `cd source && npx.cmd tsx --test tests/design-assets.test.ts tests/advent-art-pipeline.test.ts`;
`npm run gate:stage`. Playwright nem fut; fizetős eszköz (a `generate.ts` is) nem fut.

## Napló (2026-11-22)

- T1 tesztek (`ad07332d`), piros a főági kódon: a 300 000-es `'a'`-futás 37,7 s (az 1 s-os korlát felett); a `maskClip` export
  hiányzik (a külső tesztfájl betöltése bukik); a `redactClip is not a function`; a kapu vágási tesztje bukik.
- Saját tesztjavítás a zöldítés közben (sosem volt zöld): a kapu vágási tesztje rossz hosszt épített (a korlát alatt maradt, és a
  páratlan kitöltő `qBearer`-t ragasztott) — a farok most `REDACT_CAP - back` hosszú; a külső bájt-egyezési teszt `"e"×300`
  futása helyett szavakra tagolt diagnosztika (egy szóköz nélküli hosszú futást a vágás a terv szerint elhagy).
- A kapu vágása: az első két, szóköz-jellegű karakterrel határolt szó kimarad (az egyszavas futás-szabály egy félbevágott
  `Bearer` + hitelesítő pár hitelesítőjét előtag nélkül hagyta — a teszt ezt fogta meg).
- Mutánspróba: a kapu szó-kihagyása kikapcsolva → a vágási teszt bukik; a külső / képgyártói run-hátrálás kikapcsolva → az
  elöl kulcs-előfordulásokkal rövidített (a `***` / `[kulcs]` csere miatt) bemeneten a vágási teszt bukik; mind visszaállítva.
