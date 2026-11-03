# Végrehajtás: a kártya leírása a lecke bevezetője (terv: `docs/specs/2026-11-03-egyseges-kartya-leiras.md`)

Munkakönyvtár: `source/`. Ág: `feat/kartya-leiras`.

## T1: `shared/lesson-teaser.ts`

- `LESSON_PLACEHOLDER_DESCRIPTION = "Websuli lecke — a lecke-futtató jeleníti meg."`
- `teaserFromText(text, max = 160)`:
  - `**`, `__`, `*`, `_`, `` ` ``, sor eleji `#` ki;
  - az első nem üres bekezdés;
  - a szóközök egyszerűsítése;
  - mondatok `[.!?…]` + szóköz szerint, egészben, amíg ≤ `max`;
  - ha az első mondat is hosszabb: szóhatáron vágás + „…”;
  - üres eredmény → `null`.
- `lessonTeaser(json)`: `sections[0].blocks` első `kind === "explain"` blokkjának `text`-je, ennek hiányában az első olyan blokk,
  amelynek van `text`-je → `teaserFromText`.
- `isPlaceholderDescription(d)`: `!d?.trim() || d.trim() === LESSON_PLACEHOLDER_DESCRIPTION`.
- **Ellenőrzés:** `node --import tsx --test tests/lesson-teaser.test.ts` → `ℹ fail 0`.

## T2: `server/storage.ts`

- A `getAllHtmlFiles` lecke-lekérdezése (`coversByFile` forrása) kap egy `teaserText` mezőt:
  `(select b->>'text' from jsonb_array_elements(json->'sections'->0->'blocks') b where b->>'kind' = 'explain' limit 1)`.
- Fájlonként a legújabb publikált lecke (ugyanaz, mint a borítónál) → `teaserFromText`.
- A soroknál: `description: isPlaceholderDescription(row.description) && teaser ? teaser : row.description`.
- **Ellenőrzés:** `npx tsc --noEmit` → hiba nélkül.

## T3: `server/studio/pipeline-store.ts`

- `publishLesson`: az `existing` lekérdezés a lecke `json`-ját is olvassa; `const description = lessonTeaser(existing?.json) ?? LESSON_PLACEHOLDER_DESCRIPTION`.
- Mindkét ágon (meglévő fájl / új fájl) ez kerül a `description`-be.
- **Ellenőrzés:** a meglévő publikálási tesztek (`npm test`) zöldek.

## T4: tesztek, PR

- **Új:** `tests/lesson-teaser.test.ts`.
- **Futtatás:** `npx tsc --noEmit` (app + teszt), `npx eslint client/src server --max-warnings 0`, `npm test`.
- **PR:**
  - docs-commit, aztán feat-commit;
  - háromfázisú ellenőrzés;
  - `.audit-ok`;
  - PR → automatikus merge (tulajdonosi kérés) → Render-revízió.
- **Ellenőrzés élesben:**
  - `curl -s https://websuli.vip/api/html-files` → a helyőrző-leírások száma ≈ 0;
  - főoldal 390/1280 px.
