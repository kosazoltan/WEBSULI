# W1a — végrehajtási utasítás

Terv: `docs/specs/2026-11-25-w1-forrasformatumok.md`.

1. RED: `source/tests/web-document.test.ts` — A1–A3, A6 (programból épített DOCX/PPTX/ODP/ODT, kézi PDF, PPT-rekord, MHT, PNG,
   ismeretlen bináris, tömörítési bomba); `source/tests/web-gather-gpt.test.ts` bővítés — A4 (application/pdf dokumentum-módban
   elfogadva, alapból elutasítva).
2. GREEN: `source/server/studio/web-document.ts` (formátumfelismerés + kinyerés, a `document-source.ts` DOCX / MHT / képfelismerő
   segédeivel); `safe-fetch.ts` `documents` opció (`PublicPage.images`, `needsOcr`, `format`); `web-gather-gpt.ts` dokumentum-mód;
   `web-teaching-review.ts` hibaoldal-minta.
3. Próbahiba commit után; kapulánc; PR.

## W1b — végrehajtás

Cél: a csak képből álló forrás (JPG/PNG…), a szkennelt (szövegréteg nélküli) PDF és a dokumentumok beágyazott képei a webes gyártásba
(`web-studio-handoff.ts` → egylépéses gyártás) jutnak; ott a meglévő látó út (`single-run/conversation.ts`: `input_image` /
`input_file`) olvassa őket. A D1 hibrid kivágott-kép beemelése külön szelet (D1H).

1. RED: `source/tests/web-document.test.ts` — B1 szkennelt PDF (≤ 8 MB) `scan` adat-URL-lel; `source/tests/web-gather-gpt.test.ts` — B2
   `usableSource`: kép / szkennelt forrás szöveg nélkül is elfogadva (hibaoldal nem), forrásonként ≤ 3 kép ≤ 1 MB; `source/tests/
   web-studio-handoff.test.ts` — B3 a kép `image`, a szkennelt PDF `pdf` fájlként, a beágyazott képek `image`-ként mennek át, egyedi
   névvel; B4 összkeret: ≤ 6 vizuális fájl, ≤ 10 MB; a vizuális forrás a felhasznált források listáján.
2. GREEN: `web-document.ts` (`scan`), `safe-fetch.ts` / `web-teaching-review.ts` (`scan` mező), `web-gather-gpt.ts` (`usableSource`),
   `web-studio-handoff.ts` (vizuális fájlok, keretek).
3. Próbahiba commit után; kapulánc; PR.
