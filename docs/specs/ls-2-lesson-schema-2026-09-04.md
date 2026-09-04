# LS-2 — Lecke-séma, csővezeték és futtató

- **Kanban**: #102
- **Ág**: `feat/ls-2-lesson-schema` (a `fix/sec-100-…` @ `5cadde0`-ból, ami tartalmazza az LS-0/LS-1-et)
- **Master terv**: `docs/specs/lesson-studio-master-plan-2026-09-04.md` §5.2, §6, §7
- **Dátum**: 2026-09-04

## Cél

A jóváhagyott Tudás-térképből **strukturált lecke** (JSON) készül, amit egy közös
futtató renderel — nem HTML-blob, nem iframe. A lecke minden állítása vissza van kötve
a térkép egy fogalmához; ami nem köthető vissza, az nem publikálható.

## Nem-cél (LS-2-ben NEM készül el)

- A 8 animációtípus és a 3 `try` interakció **futtatója** → LS-4. A séma ismeri őket,
  a futtató most `explain / example / check / recap`-et rendereli.
- Kupon, játék-jutalom, `reward_policy`, `coupons` tábla → LS-3.
- Animátor lépés → LS-4. A csővezeték most: pedagógus → szerző → lektor.
- Szigorú `/lesson/*` CSP → LS-4.
- TTS (felolvasás) → LS-4.

## Érintett fájlok

| Fájl | Művelet |
|---|---|
| `shared/lesson-schema.ts` | ÚJ — zod `Lesson`, `Section`, `Block` (6 típus) |
| `server/studio/coverage.ts` | ÚJ — fedettségi kapu (core 100%, supporting ≥90%) |
| `server/studio/pipeline.ts` | ÚJ — állapotgép, kör-limit, idempotencia |
| `server/studio/lektor.ts` | ÚJ — jegyzet-osztályozás, D1 |
| `shared/schema.ts` | BŐVÍT — `lessons`, `studioJobs`, `lektorNotes` |
| `migrations/0009_lessons_pipeline.sql` | ÚJ |
| `client/src/lesson-runtime/` | ÚJ — futtató komponensek |
| `client/src/pages/Preview.tsx` | BŐVÍT — `contentType === 'lesson'` ág |

## Séma (a master terv §5.2 szerint, szó szerint követve)

`AgeBand` = `kid` (1–4) | `teen` (5–8) | `senior` (9–12) — **osztályból származtatva, nem tárolva kétszer**.

Blokkok (a `kind` mezőn diszkriminálva):

- `explain` — `text`, `depth: core|deeper|why`, `readAloud`, `coversConceptIds ≥1`
- `example` — `problem`, `steps ≥1`, `answer`, `coversConceptIds ≥1`
- `animate` — `animKind` (8 érték), `params`, `caption`, `coversConceptIds ≥1`
- `check` — `question`, `options 2–5`, `correctIndex`, `feedbackPerOption` (ugyanannyi), `hint?`, `coversConceptIds ≥1`
- `try` — `tryKind: dragSort|fillBlank|match`, `spec`, `coversConceptIds ≥1`
- `recap` — `bullets ≥1`, `nextLessonId?` — **az egyetlen blokk, amely fogalom nélkül állhat**

`Section = { heading, blocks ≥1, probaEnabled = true }`
`Lesson = { title, subject, classroom, mapId, sections ≥1, misconceptions[], sourceOnly: literal(true) }`

## Döntések

**D1 a sémában.** A `sourceOnly` mező `z.literal(true)` — nem elhagyható, nem `false`.
Egy `sourceOnly: false` lecke nem is parse-olható. Ez teszi géppel ellenőrizhetővé,
hogy a leckét a forrás köti.

**A `recap` az egyetlen kivétel** a fogalom-kötés alól: az összefoglaló a lecke saját
tartalmát ismétli, nem új állítás.

**Kör-limit 2.** Ha a Lektor blokkolót talál, a Szerző újraír — de legfeljebb kétszer.
Utána a job `error` státuszba megy, és ember dönt. Ok: egy végtelen szerző↔lektor kör
valódi pénz, és a harmadik kör tapasztalatilag már nem javít.

**A Lektor SOHA nem írja át a leckét.** Csak jegyzetet ad. A `book_probably_wrong`
jegyzet `info` szintű, admin-only, és a lecke szövegét nem érinti (D1, tulajdonosi
döntés: „a forrásnak akkor is nyernie kell, ha hülyeség, mert a tantervben az van").

## Elfogadási feltételek (EARS)

1. **WHEN** egy nem-`recap` blokknak nincs `coversConceptIds` eleme, **THEN** a séma elutasítja.
2. **WHEN** a lecke `sourceOnly` mezője nem `true`, **THEN** a séma elutasítja.
3. **WHEN** a lecke olyan fogalom-azonosítóra hivatkozik, ami nincs a térképben,
   **THEN** a fedettségi kapu elutasítja (a modell nem találhat ki azonosítót).
4. **WHEN** egy `core` fogalmat egyetlen blokk sem fed le, **THEN** a kapu elutasítja.
5. **WHEN** a `supporting` fedettség 90% alatt van, **THEN** a kapu elutasítja.
6. **WHEN** a Lektor `book_probably_wrong` jegyzetet ad, **THEN** a jegyzet `info`,
   nem blokkoló, és a lecke JSON-ja **bájtra változatlan** marad.
7. **WHEN** a Lektor blokkolót ad és a kör < 2, **THEN** a job a `author` lépésre tér vissza.
8. **WHEN** a kör elérte a 2-t, **THEN** a job `error`, nem indul újabb szerző-kör.

## Tesztek (RED-ben ezek íródnak először)

| Fájl | Mit rögzít |
|---|---|
| `tests/lesson-schema.test.ts` | `sourceOnly` literal, blokk-kötés, `recap` kivétel, `check` opció-számok |
| `tests/coverage-gate.test.ts` | core 100 / supporting ≥90, kitalált azonosító elutasítva |
| `tests/pipeline-state.test.ts` | állapot-átmenetek, kör-limit 2, `inputHash` cache |
| `tests/lektor-d1.test.ts` | `book_probably_wrong` = info + a lecke bájtra változatlan |

Futtatás: `node --import tsx --test "tests/*.test.ts"`.

## Kapuk

`tsc 0` · `eslint ≤989` (a baseline **nem** emelhető) · unit **278 + új** ·
`npm run build` · `npx playwright test` 18/18 · **reverz-mutáció** a fedettségi kapun
és a D1-jegyzeten.

## Kockázatok

- **A futtató új felület** → Playwright-render 375 px-en, valódi böngészőben mérve.
- **A `lessons` sor 1:1 a `html_files` sorral** (`contentType:'lesson'`) → a meglévő
  lista/nézet nem törhet el; a Preview csak akkor ágazik el, ha a típus tényleg `lesson`.
- **A csővezeték modellhívásai pénzbe kerülnek** → a tesztek injektált fake modellel
  futnak, valódi hálózat nélkül.
