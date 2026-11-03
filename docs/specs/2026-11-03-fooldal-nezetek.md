# Nyilvános főoldal: „Legfrissebb” és „Tantárgyanként” nézet, külön és együtt

**Dátum:** 2026-11-03 · **Tier:** M · **Ág:** `feat/fooldal-nezetek`
**Tulajdonosi kérés (2026-11-03):** „a nyilvános főoldalon legyen még kétféle csoportosítás. Az évfolyamba belépve
lehessen a legfrissebb tananyagokat és a tantárgyakat tantárgyanként is megtekinteni … És és vagy relációban is.”

## Cél (értelmezés)

Évfolyamot választva (és a „Mind” nézetben is) a tanuló / szülő két, egymástól függetlenül be- és kikapcsolható
nézet közül választhat:

| Választás | Mit lát |
|---|---|
| egyik sem (alap) | a mai lista változatlanul: NAT-tanmenet szerinti sorrend, „Most tanuljuk” jelöléssel |
| csak **Legfrissebb** (VAGY) | az évfolyam összes anyaga a legújabb elkészülttel kezdve (`createdAt` csökkenő) |
| csak **Tantárgyanként** (VAGY) | tantárgyi szakaszok (fejléc + darabszám), szakaszon belül tanmenet szerinti sorrend |
| **mindkettő** (ÉS) | felül a „Legfrissebb” sáv (a 8 legújabb), alatta a tantárgyi szakaszok, szakaszon belül legújabb elöl |

A keresés és az évfolyamszűrő minden nézetre érvényes. A választás eszközönként megmarad (`localStorage`).

## Mért kiinduló állapot

- `GET /api/html-files` (élő, 2026-11-03): 219 anyag; **nincs tantárgy mező**. 165 anyag illeszkedik a
  NAT 2020 / iskolai tanmenetre (`curriculum.label`), a többi `null`.
- A szerver tantárgyat már felismer (`server/curriculum/match.ts`): a tanmenet-terv `subject` kulcsa (17 kulcs:
  `matematika`, `magyar-nyelvtan`, `magyar-nyelv-es-irodalom`, `magyar-irodalom`, `angol`, `francia`, `informatika`,
  `enek-zene`, `hit-es-erkolcstan`, `kornyezetismeret`, `termeszetismeret`, `tortenelem`, `tarsadalmi-ismeretek`,
  `biologia`, `fizika`, `foldrajz`, `kemia`), illetve cím / szókincs / tartalom alapján (`subjectsOfTitle`,
  `subjectByVocabulary`) — de csak belső illesztésre használja, a kliens nem kapja meg.
- A főoldali lista: `client/src/components/UserFileList.tsx` (évfolyam-chipek, keresés, `curriculumSort`).

## Döntések

1. **Tantárgy forrása (szerver):** tanmenet-illesztésnél a terv `subject` kulcsa; különben ugyanaz a felismerési lánc,
   ami az illesztést vezérli (cím → tanmenet-szókincs → tartalomjelzők), az első jelölt; ha nincs: `null` → „Egyéb”.
   A lista elemei új `subject: string | null` mezőt kapnak (`withCurriculum`). Régi szerver / hiányzó mező: „Egyéb”.
2. **Megjelenített név:** közös térkép `shared/subjects.ts` (`SUBJECT_LABELS`); a `magyar-nyelvtan` és a
   `magyar-nyelv-es-irodalom` egyaránt „Magyar nyelv”. Szakaszok sorrendje: magyar ábécé (`localeCompare("hu")`),
   „Egyéb” mindig utolsó.
3. **Logika tiszta modulban:** `client/src/lib/home-views.ts` (`newestFirst`, `groupBySubject`, `NEWEST_STRIP = 8`,
   `parseHomeView`) — unit-tesztelhető, a komponens csak megjelenít.
4. **UI:** a keresősor alatt „Nézet:” két kapcsológomb (`aria-pressed`): „Legfrissebb”, „Tantárgyanként”; mellettük
   rövid magyarázat („egyszerre mindkettő is”). Tantárgyi nézetben a szakaszok fölött tantárgy-ugrógombok (a szakaszra
   görgetnek). A kártya-megjelenítés közös (a meglévő kártya kiemelve, viselkedés változatlan). Mobilon a gombok
   ≥ 44 px érintési célt kapnak.

## Nem cél

- Tantárgy kézi szerkesztése, a besoroló modell / adatbázis módosítása.
- A „Most tanuljuk”, a borítókártya és a lájk-logika változtatása.
- A játék- és üdvözlőkártyák.

## Érintett fájlok

- `source/server/curriculum/match.ts` (`subjectOfMaterial`), `source/server/curriculum/index.ts` (`subject` mező)
- `source/shared/subjects.ts` (új)
- `source/client/src/lib/home-views.ts` (új), `source/client/src/components/UserFileList.tsx`
- `source/tests/home-views.test.ts` (új unit), `source/tests/curriculum.test.ts` (új esetek)
- `source/tests/home-views.spec.ts` (új Playwright), `source/playwright.home-views.config.ts` (új, vite + mock)

## Edge case-ek

- Üres keresési találat bármely nézetben → a meglévő „Nincs találat” kártya.
- Egyetlen tantárgy → egy szakasz, ugrógombok nélkül.
- Évfolyam nélküli (0) anyag → `subject` lehet `informatika` a cím alapján, különben „Egyéb”.
- Sérült / ismeretlen `localStorage`-érték → alapnézet; tiltott tárhely (privát mód) → nincs hiba.
- Azonos `createdAt` → stabil sorrend (azonosító szerint).

## Elfogadás (EARS)

- WHEN a lista betölt, THEN minden elemnek van `subject` mezője (kulcs vagy `null`).
- WHEN egyik nézet sincs bekapcsolva, THEN a sorrend és a „Most tanuljuk” jelölés a mai (a meglévő
  `curriculum-order` teszt változatlanul zöld).
- WHEN csak „Legfrissebb”, THEN a kártyák `createdAt` szerint csökkenőek, szakaszfejléc nélkül.
- WHEN csak „Tantárgyanként”, THEN tantárgyanként egy szakasz (név + darabszám), „Egyéb” utolsó, belül tanmenet-sorrend.
- WHEN mindkettő, THEN felül legfeljebb 8 legújabb a „Legfrissebb” sávban, alatta a tantárgyi szakaszok legújabb elöl.
- WHEN a nézet bekapcsolva és az oldal újratölt, THEN a választás megmarad.
- WHEN 390×844 és 1366×768, THEN nincs vízszintes görgetés, a nézetgombok és a kártyák nem takarnak egymásra.
