# A Node-verzió rögzítése: 24.x mindenhol — terv (2026-10-15)

## Tények (Render-napló, kód)
- `source/package.json`: `"engines": { "node": ">=22.16.0" }` — csak alsó határ. A Render-napló: „Using Node.js version 26.12.0 via
  /opt/render/project/src/source/package.json” (2026-10-15 01:10 óta) → az éles szerver magától a legújabb főverzióra ugrik.
- A CI (`.github/workflows/ci.yml`) Node 22-n tesztel, a helyi fejlesztés Node 24.18-on fut → a tesztek nem azt a verziót igazolják, ami élesben fut.
- Következmény (ma 16:41 óta a naplóban): a `pdfjs-dist` natív `canvas` modulja Node 22-es ABI-val (127) maradt, a Node 26 (147) nem tölti be
  („Cannot polyfill DOMMatrix / Path2D”). Ma ártalmatlan — a szerver csak szövegkinyerésre használja a pdfjs-t (`getTextContent`,
  `server/studio/document-source.ts`) —, de egy natív modul vagy viselkedésváltozás tesztelés nélkül törheti az éles működést.
- A `render.yaml` `NODE_VERSION: 22.16.0` bejegyzése az élő szolgáltatáson nincs érvényben (a napló a package.json-t nevezi meg).

## Tulajdonosi döntés (2026-10-15)
**Rögzítés 24.x-re (LTS), a CI is 24.** Az éles, a CI és a fejlesztés ugyanazon a főverzión.

## Cél / nem-cél
- Cél: `engines.node = "24.x"` (package.json + package-lock gyökér), `render.yaml` `NODE_VERSION` 24, CI `node-version: '24'` mind a négy jobban.
- Nem-cél: a Render-szolgáltatás beállításainak kívülről (API-n) módosítása; függőségfrissítés.

## Elfogadás
- E1: a CI mind a négy jobja Node 24-en zöld.
- E2: a deploy után a Render-napló „Using Node.js version 24.…”-t ír, a health 200, a `canvas.node` figyelmeztetés nem jelenik meg PDF-feldolgozáskor.
