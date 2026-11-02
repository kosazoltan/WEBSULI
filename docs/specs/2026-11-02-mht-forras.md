# MHT (MHTML) forrásfájl feltöltése tananyagkészítéshez

Tulajdonosi kérés 2026-11-02: a Stúdió forrásfeltöltése fogadjon el `.mht` / `.mhtml` fájlt is
(pl. böngészőből „Weblap mentése egyetlen fájlként” — próbafájl: `Szophoklész_ Antigoné.mht`, VMEK).

## Cél
- A `SourceUploadForm` (tananyagkészítés és tudás-térkép) `.mht` és `.mhtml` fájlt is felvesz.
- A szerver az MHT-ből determinisztikusan, modell nélkül olvasható szöveget nyer ki (mint a docx-nél),
  és ez a `extractedText` megy tovább a kinyerésbe / idézet-ellenőrzésbe.

## Nem-cél
- Az MHT-be ágyazott képek külön képforrásként (OCR) való feldolgozása — csak a fő HTML-rész szövege.
- Más feltöltők (`SimpleHtmlUpload`, `PdfUpload`, `BackupManager`) bővítése.
- A docx/pdf hibaágak viselkedésének módosítása.

## Ellenőrzött tények (kódból)
- Fajták: `shared/knowledge-map-schema.ts:25` `SOURCE_KINDS`; kliens-tükör: `shared/studio-ui.ts:281` és `KIND_BY_EXT`.
- A végpontok a `SOURCE_KINDS`-ot validálják (`server/studio/request.ts:32`, `server/studio/one-step.ts:29`).
- A kinyerés egyetlen előkészítő pontja: `server/studio/single-run/live.ts` `prepareFiles` → `normalizeDocumentSources`
  (`server/studio/document-source.ts`). Hibánál az eredeti fájl megy tovább (PDF natív olvasáshoz).
- Idézet-ellenőrzés szövege: `server/studio/extractor.ts:96` `sourceTextOf` (text/docx/pdf szűrő).
- HTML → szöveg: `server/studio/safe-fetch.ts` `htmlToText` (parse5) — újrahasznosítjuk.
- A próbafájl: `multipart/related`, a gyökérrész `text/html`, `Content-Transfer-Encoding: binary`,
  a karakterkészlet csak a `<meta ... charset=ISO-8859-2>`-ben; van egy második (követőkód) `text/html` rész is.

## Rögzített döntések
- Új fajta: `"mht"` (a `SOURCE_KINDS`-ban és a kliens-tükörben); kiterjesztés: `mht`, `mhtml`.
- A kliens data-URL-ként olvassa (bájtok, mert a karakterkészlet csak a szerveren dönthető el).
- MIME-bontás saját, kis függvénnyel (`readMhtText`): boundary a fejlécből; részenként
  `Content-Type`, `Content-Transfer-Encoding` (binary / 8bit / 7bit / quoted-printable / base64), `charset`.
- Gyökérrész: a `start` paraméter `Content-ID`-ja, ha van; különben a `Snapshot-Content-Location`-nel egyező
  `text/html` rész; különben az első `text/html` rész. Csak a gyökérrész szövege kerül be (a követőkód-iframe nem).
- Karakterkészlet: rész-fejléc `charset` → `<meta charset>` → utf-8; `TextDecoder` (iso-8859-2, windows-1250 is).
- Nem-multipart MHT (egyetlen `text/html` törzs) is elfogadott.
- MHT-hiba NEM nyelhető el a `prepareFiles`-ban (a nyers base64 nem mehet szövegként a modellhez): érthető magyar hiba.

## Edge case-ek
- Quoted-printable soft line break (`=\r\n`) és `=C3=A9` bájtok többbájtos UTF-8-ként dekódolva.
- Base64 törzs sortörésekkel.
- Hiányzó boundary / nincs `text/html` rész → „Az MHT-fájlban nincs olvasható weboldal.”
- Üres szöveg → a meglévő „A dokumentumból nem olvasható tananyagszöveg.” hiba.
- 25 MB-os méretkorlát ugyanúgy érvényes.

## Elfogadás (EARS)
- HA a felhasználó `.mht`/`.mhtml` fájlt választ, AKKOR a form `kind: "mht"` forrásként felveszi (nem „Nem támogatott fájl”).
- HA a szerver `mht` forrást kap, AKKOR `extractedText` a gyökér-HTML szövegét tartalmazza helyes ékezetekkel,
  és `sourceTextOf` ezt adja vissza.
- HA a próbafájlt (`Szophoklész_ Antigoné.mht`) dolgozzuk fel, AKKOR a szövegben szerepel „Antigoné”, „Trencsényi-Waldapfel Imre”,
  „SZEMÉLYEK”, és nem szerepel `�` (U+FFFD) karakter, sem a követőkód-rész tartalma.
- HA az MHT olvashatatlan, AKKOR a gyártás érthető magyar hibával áll meg, nem base64 szöveggel.
- Tesztek: `npm test` (új esetek: QP+utf-8, base64+windows-1250, binary+meta ISO-8859-2, gyökérválasztás), `npm run check`.
