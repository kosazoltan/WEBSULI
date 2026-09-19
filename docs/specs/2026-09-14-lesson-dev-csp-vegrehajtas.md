# AI-végrehajtás — helyi lecke CSP

1. Olvasd el a társ-specet és a server/index.ts, server/lib/csp-profiles.ts, server/vite.ts állományokat. Ne módosíts más dirty kódot vagy meglévő tesztet.
2. A CspContext kapjon opcionális devScriptNonce mezőt. A lessonCspDirectives csak development esetben engedje, és 32 base64 karaktert várjon. A scriptSrcAttr maradjon none.
3. Az index strict lesson ágában development esetén randomBytes(24).toString('base64') kerüljön res.locals.lessonCspNonce-ba; add tovább a profilnak. Production ne generáljon nonce-t.
4. A setupVite konfigurációban html.cspNonce placeholder legyen, ne a közös buildkonfigurációban. Transzformáció után a HTML-ben helyettesítsd a kérés res.locals értékével vagy más dev útvonalon friss random nonce-szal. HTML válasz no-store. A production serveStatic változatlan.
5. Új tests/lesson-dev-csp.test.ts: nonce forma és production figyelmen kívül hagyás; valódi Vite5+React plugin transzformáció tesztelje a preamble nonce-t és meta tageket. Meglévő CSP-tesztekhez ne nyúlj.
6. source alatt: node --import tsx --test tests/lesson-dev-csp.test.ts tests/csp-lesson-route.test.ts tests/vercel-lesson-csp.test.ts; npm.cmd run check; npm.cmd run lint; npm.cmd run check:test. Mind PASS.
7. Külön csak-olvasó review a nonce élettartamról, fejléc/HTML azonosságról és production izolációról. Hiba esetén implementációt javíts.
8. Aktív munkák kizárása és mentés után helyi restart. Chrome valódi /lesson leckeoldal és /preview 320/1440 px: tabok, screenshot, no overflow, no pageerror. Két HTML GET fejléc/nonce/no-store egyezés, eltérő kérésnonce. Inline nem nonce-olt próbát blokkolja a CSP.
9. npm.cmd run verify és git diff --check; a társ-specbe a tényleges kimenetet rögzítsd. Éles deploy NOT RUN, mert nincs kérve. A körlimitnél megállt másik tananyag továbbra sem kész.