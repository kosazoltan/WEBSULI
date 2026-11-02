# Végrehajtás — MHT forrásfájl (terv: `docs/specs/2026-11-02-mht-forras.md`)

Munkakönyvtár: `source/`. Sorrendben.

## T1 — fajta felvétele
- `shared/knowledge-map-schema.ts`: `SOURCE_KINDS = ["pdf", "image", "docx", "text", "mht"]`.
- `shared/studio-ui.ts`: `SourceFileKind` bővül `"mht"`-vel; `KIND_BY_EXT`: `mht: "mht"`, `mhtml: "mht"`.

## T2 — MHT-olvasó
- `server/studio/safe-fetch.ts`: a `charsetOf` és `decode` függvény `export`-ot kap (viselkedés változatlan).
- `server/studio/document-source.ts`: új `export async function readMhtText(content: string): Promise<string>`:
  1. data-URL → `Buffer`; latin1-ként stringgé (bájthű).
  2. Fejléc/törzs szétválasztás az első üres sornál (`\r?\n\r?\n`).
  3. `multipart/*` esetén boundary a fejlécből (`boundary="..."` vagy idézőjel nélkül), részekre bontás `--boundary` sorokon.
  4. Részenként: fejlécek (folytatósorok összevonva), `Content-Transfer-Encoding` szerinti dekódolás bájtokra.
  5. Gyökérválasztás: `start` Content-ID → `Snapshot-Content-Location` egyezés → első `text/html`.
  6. Karakterkészlet: `charsetOf(content-type, bytes)` → `decode`; `htmlToText(html).text`.
  7. Nincs `text/html` rész → `throw new Error("Az MHT-fájlban nincs olvasható weboldal.")`.
- `normalizeDocumentSources`: a szűrő `["pdf", "docx", "mht"]`; `file.kind === "mht"` → `text = await readMhtText(file.content)`.

## T3 — downstream
- `server/studio/extractor.ts` `sourceTextOf`: a szűrő `|| f.kind === "mht"`.
- `server/studio/single-run/live.ts` `prepareFiles`: `catch (error) { if (file.kind === "mht") throw error; out.push(file); }`.

## T4 — kliens
- `client/src/components/studio/SourceUploadForm.tsx`: `accept` kiegészül `.mht,.mhtml`-lel; a két tájékoztató szöveg „docx, mht”.

## T5 — tesztek (új esetek, meglévő tesztek változatlanok)
- `tests/document-source.test.ts`: QP+utf-8 multipart; base64+windows-1250; binary + meta ISO-8859-2 + második követő `text/html` rész
  (csak a gyökér szövege kerül be); `start` paraméteres gyökér; nincs html rész → hiba; `sourceTextOf` adja a szöveget.
- `tests/studio-extract-upload-ui.test.ts`: új teszt: `fileKindOf("lap.mht") === "mht"`, `fileKindOf("lap.MHTML") === "mht"`.
- Parancs: `npm test` → minden PASS; `npm run check` → 0 hiba.

## T6 — valós próba
- Szkript a scratchpadben: `readMhtText` a `C:\Users\Kósa Zoltán\Downloads\Szophoklész_ Antigoné.mht` data-URL-jén;
  elvárás: „Antigoné”, „Trencsényi-Waldapfel Imre”, „SZEMÉLYEK” szerepel, `\uFFFD` és `gemius` nem.
- Böngészős próba: a Stúdió feltöltőn a fájl kiválasztása után a fájl a listában `mht` jelvénnyel látszik.
