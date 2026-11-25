# W1a — webes forrás minden formátumban (PDF, DOCX, PPTX, PPT, ODP/ODT, MHT, kép)

Forrás: tulajdonosi döntés 2026-11-24 (kanban t_273336c4, W1): „minden forrásformátum képpel együtt — webes PDF, DOCX, MHT, JPG/képek,
PPT/PPTX és más prezentációk”; D1 HIBRID (táblázat/folyamatábra újrarajzolva, fénykép és nehezen rajzolható ábra kivágott képként,
forrásmegjelöléssel). A követelmény-revízió (#5/#6) lelete: W1 hiányzó — a webes letöltő (`safe-fetch.ts`) csak HTML-t és sima szöveget
fogad el, minden más formátumot „Nem szöveges tartalom” hibával eldob; a `web-teaching-review.ts` hibaoldal-mintája a „Korlátozva /
restricted” oldalt nem ismeri fel.

## Cél
A forrásgyűjtő (`web-gather-gpt.ts`) a talált dokumentumokat is forrásként kapja: a szöveg kinyerve, a beágyazott / önálló képek
megőrizve (W1b használja őket a D1 hibrid úton).

## Szeletek
- **W1a (ez):** formátumfelismerés a BÁJTOK alapján (nem a fejléc vagy kiterjesztés alapján), szövegkinyerés és képgyűjtés; a letöltő
  dokumentum-módja; a hibaoldal-minta bővítése.
- **W1b:** kép- és szkennelt forrás (JPG, képes PDF) átírása látó modellel, és a képek a D1 hibrid szerint a leckébe (kivágott kép
  forrásmegjelöléssel / újrarajzolás).

## W1a elfogadási feltételek
- A1 `readWebDocument(bytes, contentType, url)`: PDF (szövegréteg, oldalszámmal), DOCX, PPTX (diánként, jegyzetekkel), PPT (régi bináris:
  szövegrekordok), ODP/ODT (content.xml), MHT, HTML, sima szöveg; kép → üres szöveg + a kép maga. Ismeretlen bináris → érthető hiba.
- A2 Képek: DOCX `word/media`, PPTX `ppt/media`, ODP/ODT `Pictures/`, MHT képrészek; legfeljebb 8 kép, egyenként ≤ 2 MB, csak valódi
  (bájtokból felismert) JPEG/PNG/WEBP/GIF; minden kép forrás-URL-lel.
- A3 Szkennelt (szövegréteg nélküli) PDF: `needsOcr: true`, a szöveg üres — nem hiba (a W1b írja át).
- A4 `fetchPublicPage(url, { documents: true })`: a dokumentumot is elfogadja (méretkorlát 15 MB); alapból (dokumentum-mód nélkül)
  a régi viselkedés marad (hírlevél).
- A5 A `web-gather-gpt` dokumentum-módban tölt; a kép / szkennelt forrás (szöveg nélkül) W1b nélkül nem kerül a forráslistába.
- A6 `sourceIsErrorPage`: a „Korlátozva”, „Hozzáférés megtagadva”, „Access restricted / Restricted” oldal hibaoldal.
- Biztonság: a ZIP-kibontás bejegyzésenként és összesen korlátozott (tömörítési bomba), a CFB-olvasás határon belüli.
