# Spec: az ellenőrző kérdés és a záró összefoglaló fejléce a tartalomból

> Dátum: 2026-11-08 · Állapot: **JÓVÁHAGYVA (tulajdonos, 2026-11-08: „Yes, do it”)** · Kanban: #8
> Előzmény: `docs/specs/2026-11-08-borito-blokkcimkek.md` (PR #405). Végrehajtás: `docs/specs/2026-11-08-tartalmi-fejlecek-2-vegrehajtas.md`.

## Kérés és mért tény
- Tulajdonos: a kártyacímek legyenek változatosak, mindig a tartalom alapján. A #405 után az `explain` / `animate` / `try` már ilyen;
  az élő mérés (2026-11-08, „Harasztok…”) szerint a `check` 13× „Ellenőrző kérdés”, a `recap` 12× „Összegzés” maradt.
- `source/shared/lesson-block-label.ts` `blockLabel`: a `check` és a `recap` a sáv rögzített címkéjét adja.

## Cél
- `check`: az IQ-forma a kérdés szövegéből — „Igaz vagy hamis?”, „Kakukktojás”, „Találós kérdés”, „Analógia”, „Sorminta”,
  „Melyik hamis?”, „Következtetés”; egyéb kérdés → a sáv címkéje.
- `recap`: a lecke UTOLSÓ fejezetének utolsó összefoglalója (a mese-visszatérés helye) → „A lecke tanulsága”; a többi → a sáv címkéje.

## Nem cél
- `example` fejléce; a sáv-címkék (`BAND_THEME`) módosítása; a kvízlap (Kvíz fül) kérdései.

## Döntések
- A felismerés sorrendje: igaz/hamis → kakukktojás → találós → analógia → sorminta → hamis állítás → következtetés (az első egyező).
- A `blockLabel` új opcionális paramétere `isLastSection?: boolean`; a lejátszó `LessonSection` a `sectionIdx === sections.length - 1`
  értéket adja. Paraméter nélkül a régi viselkedés.

## Edge case-ek
- Üres / rövid kérdés: sáv-címke. „Ha …, akkor” csak egy mondaton belül számít (`[^.?!]*`).
- Több `recap` az utolsó fejezetben: csak az utolsó kapja a „A lecke tanulsága” címkét.

## Elfogadás (EARS)
- [ ] A1: WHEN a `check` kérdése a felsorolt formák egyike THEN a `blockLabel` SHALL a forma nevét adja; egyébként a sáv címkéjét.
- [ ] A2: WHEN a `recap` az utolsó fejezet utolsó összefoglalója THEN „A lecke tanulsága”; egyébként a sáv címkéje.
- [ ] A3: valós böngészős render (PR Vercel-előnézet, élő „Harasztok…” lecke) összevonás előtt; `check`, `lint`, `check:test`, `npm test` hibátlan.
