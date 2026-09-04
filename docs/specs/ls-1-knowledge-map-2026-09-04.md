# LS-1 — Tudás-térkép (KnowledgeMap)

- **Kanban**: #99
- **Ág**: `feat/ls-1-knowledge-map` (a `feat/ls-0-hygiene` @ `50d6b39`-ből)
- **Master terv**: `docs/specs/lesson-studio-master-plan-2026-09-04.md`
- **Dátum**: 2026-09-04

## Cél

A feltöltött forrásból (PDF / JPG / PNG / DOCX / TXT) **strukturált, forráshoz kötött
fogalomjegyzék** készül, amit a tanár átnéz és jóváhagy. Ez a Tudás-térkép a későbbi
lecke-írás **határa**: az LS-2 szerző csak olyan állítást írhat le, ami visszavezethető
a térkép egy fogalmára.

Ma (`routes.ts:1853–1988`) a feltöltött fájlokból `extractedText + suggestedTitle +
topics` készül, majd **elveszik** — nincs tárolva, nincs fogalomra bontva, nincs
forráshivatkozás, nincs emberi jóváhagyás. Az LS-1 ezt a veszteséget szünteti meg.

## Nem-cél (LS-1-ben NEM készül el)

- Lecke-séma, lecke-írás, lecke-futtató → LS-2.
- Kupon, jutalom, játékmotor → LS-3.
- Animációtípusok → LS-4.
- A meglévő `analyze-files` végpont **átalakítása** — érintetlen marad, mellé kerül az új út.
- Fogalom-statisztika, „javíts itt" → LS-5.

## Érintett fájlok

| Fájl | Művelet |
|---|---|
| `shared/knowledge-map-schema.ts` | ÚJ — zod séma + típusok |
| `shared/schema.ts` | BŐVÍT — `knowledgeMaps`, `kmConcepts` táblák |
| `migrations/0008_knowledge_maps.sql` | ÚJ |
| `server/studio/verbatim.ts` | ÚJ — D1 forrás-hűség ellenőrzés |
| `server/studio/extractor.ts` | ÚJ — kivonatoló futtatás + idempotencia |
| `server/routes/studio.ts` | ÚJ — admin végpontok |
| `server/routes.ts` | BŐVÍT — a studio router beregisztrálása |
| `client/src/components/studio/KnowledgeMapEditor.tsx` | ÚJ — kurátori felület |
| `client/src/pages/admin.tsx` | BŐVÍT — új fül |

## Adatmodell

**`knowledge_maps`** — egy forráscsomag egy kivonatolása.
`id` · `title` · `subject` · `classroom` (0–12) · `unit` · `status`
(`draft` \| `review` \| `approved`) · `sourceFiles` jsonb · `inputHash` (idempotencia) ·
`model` · `createdBy` · `approvedBy` · `approvedAt` · `createdAt` · `updatedAt`

**`km_concepts`** — a térkép egy fogalma.
`id` · `mapId` (FK cascade) · `term` · `definition` · `quote` (**szó szerinti** forrás-idézet) ·
`sourceRef` jsonb (`{file, page?, region?}`) · `type` (`definition`\|`fact`\|`date`\|`formula`\|
`procedure`\|`person`\|`place`) · `examWeight` (`core`\|`supporting`\|`extra`) · `relatedIds` jsonb ·
`verbatimOk` boolean · `reviewState` (`pending`\|`kept`\|`edited`\|`rejected`) · `orderIndex`

## Döntések

**D1 érvényesítése (a forrás mindig nyer).** Minden fogalomhoz kötelező a `quote`: a
forrásszöveg **szó szerinti** részlete. A `checkVerbatim()` normalizálás után (kisbetű,
whitespace-összevonás, magyar tipográfiai idézőjelek és kötőjelek egységesítése)
megköveteli, hogy a `quote` **tényleges részlánca** legyen a kivonatolt szövegnek.
Ha nem az → `verbatimOk=false`, a fogalom **nem hagyható jóvá**. A modell nem
„javíthatja" a tankönyvet: amit nem tud idézni, azt nem állíthatja.

**Idempotencia.** `inputHash = sha256(normalizált fájltartalmak + scope)`. Azonos
bemenetre nem indul új drága vision-hívás, a meglévő térkép jön vissza. Ok: egy
20 oldalas PDF újrafuttatása valódi pénz.

**Jóváhagyási kapu.** `approved` státusz csak akkor, ha minden `core` fogalom
`verbatimOk=true` és `reviewState ∈ {kept, edited}`, és nincs `pending`. Ez a
fedettségi kapu (master terv) bemeneti oldala.

**Admin-only.** Minden végpont `isAuthenticatedAdmin` mögött — a kivonatolás pénzbe kerül.

## Elfogadási feltételek (EARS)

1. **WHEN** a kivonatoló olyan fogalmat ad vissza, amelynek `quote`-ja nem részlánca a
   forrásszövegnek, **THEN** a fogalom `verbatimOk=false` értékkel tárolódik, és a térkép
   nem hagyható jóvá.
2. **WHEN** ugyanaz a forráscsomag kétszer kerül kivonatolásra, **THEN** a második hívás a
   meglévő térképet adja vissza, új modellhívás nélkül.
3. **WHEN** a kliens hibás alakú fogalmat küld (hiányzó `quote`, ismeretlen `examWeight`),
   **THEN** a szerver 400-at ad, és nem ír a DB-be.
4. **WHEN** nem-admin hívja bármelyik studio végpontot, **THEN** 401/403 a válasz.
5. **WHEN** minden `core` fogalom `verbatimOk=true` és nincs `pending`, **THEN** a térkép
   `approved` státuszba állítható.

## Tesztek (RED-ben ezek íródnak először)

| Fájl | Mit rögzít |
|---|---|
| `tests/knowledge-map-schema.test.ts` | zod séma: kötelező `quote`, enum-határok, `classroom` 0–12 |
| `tests/studio-verbatim.test.ts` | `checkVerbatim` — E1: nem-idézet elutasítva; normalizálás (idézőjel, kötőjel, whitespace, kis/nagybetű); üres quote elutasítva |
| `tests/studio-extractor.test.ts` | `computeInputHash` stabil és sorrend-független; `extractKnowledgeMap` cache-találatnál nem hív modellt |
| `tests/studio-approval.test.ts` | `canApprove()` — a fenti 5. feltétel és annak megsértései |

Futtatás: `node --import tsx --test "tests/*.test.ts"` (kanonikus, `.github/workflows/ci.yml`).

## Kapuk

`tsc 0` · `eslint ≤989` (a baseline **nem** emelhető) · unit **222 + új** · `npm run build` ·
`npx playwright test` 18/18 · **reverz-mutáció** legalább a `checkVerbatim`-re.

## Kockázatok

- **Vision-hívás pénzbe kerül** → az extractor tesztjei injektált fake modellel futnak, valódi hálózat nélkül.
- **DB-migráció** → `IF NOT EXISTS`, additív, meglévő táblát nem érint.
- **A `routes.ts` már 5666 sor** → az új végpontok külön routerbe (`server/routes/studio.ts`) kerülnek, nem a monolitba.
