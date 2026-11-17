# Spec: Külső, más rendszerű ellenőr (Google Gemini) a minőségkapuk mellé

> Dátum: 2026-11-17 · Állapot: JÓVÁHAGYVA (tulajdonosi kiegészítés 2026-11-17) · Előzmény: `docs/specs/2026-11-17-minosegkapuk.md`
> Végrehajtás: `docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md`

## 1. Cél

A Claude-alügynökös független fejlesztési ellenőr MELLÉ egy második, más rendszerű vélemény: a Google Gemini (`gemini-4-carbon`,
`thinkingLevel: HIGH`) a Gemini API-n át kapja meg a diffet, a spec-fejezetet és az ellenőrzőlistát, és hibát keres. A jelentést az
orkesztrátor második véleményként olvassa be; az állításait a kódból ellenőrizni kell (a külső modell nem lát a repóba).

## 2. NEM cél

- A döntő ítélet nem változik: a Claude-alügynökös ellenőr ítélete + az orkesztrátor dönt. A külső jelentés hiánya nem bukás.
- CI-bekötés (nyilvános repó: kulcs a CI-ban csak külön tulajdonosi döntéssel, `workflow_dispatch` / védett ág).
- A `source/` alkalmazáskód.

## 3. Érintett területek

- Új: `scripts/qa/gates/external-review.mjs` (+ `.test.mjs`), `scripts/qa/gates/external-review/checklist-{game,general}.md`.
- Módosul: `scripts/qa/gates/pre-pr-gate.mjs`, `scripts/qa/gates/pre-merge-gate.mjs` (figyelmeztető lépés), `scripts/qa/gates/lib.mjs`
  (a külső jelentés bizonyítékának olvasása), a `websuli-fejlesztesi-ellenor` skill (mindkét helyen), `AGENTS.md` (egy mondat),
  `docs/minosegkapuk.md`.

## 4. Rögzített döntések

- K1 — Kulcs: KIZÁRÓLAG a `GEMINI_API_KEY` környezeti változó vagy `--env-file <fájl>` (csak a `GEMINI_API_KEY=` sort olvassa). Útvonal
  nem égethető be; a kulcs soha nem kerül kimenetbe, naplóba, jelentésbe vagy bizonyíték-fájlba (`maskSecrets`, az `x-goog-api-key`
  fejlécben megy, nem URL-ben).
- K2 — Nincs kulcs / elfogyott a keret: „KIHAGYVA”, 0-s kilépés; `--strict` mellett 2.
- K3 — Küldés ELŐTT titok-szűrés mindenre (diff, teljes fájlok, spec, lista, kiegészítő anyag); találatnál a szkript megáll (4), a
  jelentésben csak `forrás:sor (fajta)`. Kizárt fájlok: `.env*`, bináris, mérési adatok, lock, `node_modules`, kulcsfájlok.
- K4 — Bizonyíték: a szkript `--record` kapcsolóval `external-<fej>.json`-t ír a bizonyíték-tárba (állapot, modell, token-összegek,
  jelentés útja és SHA-256-ja — kulcs és jelentés-szöveg nélkül). A `pre-pr-gate` / `pre-merge-gate` ezt csak FIGYELMEZTETÉSKÉNT nézi
  (`WARN`, ha hiányzik vagy KIHAGYVA; `PASS`, ha lefutott). Soha nem `FAIL`.
- K6 — Siker CSAK nem üres válasz + `finishReason` STOP + ítélet-fejezet esetén; különben `incomplete` / `blocked` bizonyíték,
  `.hianyos.md`, nem nulla kilépés (a #490 bot-lelete). Minden kapcsolati URL külön vizsgálva, fail-closed (a #490 bot-lelete).
- K7 — A működő állapot (éles futásból): Interactions háttér-mód `max_output_tokens` 131 072-vel (költségfék), az azonosító
  azonnal mentve; időtúllépést / megszakadt kapcsolatot nem ismétel; szint `high`; nyers bank-adat alapból kizárva.
- K5 — A forrásban e-mail-alakú szöveg nincs (a nyilvános repó címőre miatt): az engedélyezett címeket futásidőben rakja össze.

## 5. Edge case-ek

Nincs kulcs; 402 (keret) → KIHAGYVA; 429 / 5xx → legfeljebb 3 újrapróba; túl nagy bemenet → 5 (bontani); titok a diffben → 4;
`--dry-run` → csak `countTokens`; a jelentés csonka (`finishReason` ≠ STOP) → jelölve.

## 6. Elfogadás (EARS)

- WHEN nincs `GEMINI_API_KEY` THEN the script SHALL „KIHAGYVA” jelentést írni és 0-val kilépni (`--strict`: 2).
- WHEN a bemenetben titok-minta vagy nem engedélyezett e-mail van THEN the script SHALL a hálózat elérése nélkül 4-gyel megállni, érték nélkül.
- WHEN a kulcs bármely kimenetbe kerülne THEN the script SHALL helyőrzőre cserélni.
- WHEN a `pre-pr-gate` / `pre-merge-gate` fut THEN SHALL a külső jelentés hiányát `WARN`-ként jelezni, és nem bukni miatta.
- WHEN a CI „Háromfázisú rend” jobja fut THEN SHALL az `external-review.test.mjs`-t is futtatni (a meglévő glob).

## 7. Tesztterv

`external-review.test.mjs` (17 + a bizonyíték-írás esetei), `pre-pr-gate.test.mjs` / `pre-merge-gate.test.mjs` (a figyelmeztető lépés).

## 8. Kockázat

Költség (~0,4–1,5 USD / PR) — csak kézi futtatás. A külső modell hallucinálhat — a skill kötelező visszaellenőrzést ír elő.

## 9. Végrehajtás

- `docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md`
