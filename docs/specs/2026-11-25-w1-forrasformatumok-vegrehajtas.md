# W1a — végrehajtási utasítás

Terv: `docs/specs/2026-11-25-w1-forrasformatumok.md`.

1. RED: `source/tests/web-document.test.ts` — A1–A3, A6 (programból épített DOCX/PPTX/ODP/ODT, kézi PDF, PPT-rekord, MHT, PNG,
   ismeretlen bináris, tömörítési bomba); `source/tests/web-gather-gpt.test.ts` bővítés — A4 (application/pdf dokumentum-módban
   elfogadva, alapból elutasítva).
2. GREEN: `source/server/studio/web-document.ts` (formátumfelismerés + kinyerés, a `document-source.ts` DOCX / MHT / képfelismerő
   segédeivel); `safe-fetch.ts` `documents` opció (`PublicPage.images`, `needsOcr`, `format`); `web-gather-gpt.ts` dokumentum-mód;
   `web-teaching-review.ts` hibaoldal-minta.
3. Próbahiba commit után; kapulánc; PR.
