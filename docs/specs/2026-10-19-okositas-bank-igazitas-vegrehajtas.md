# HTML-okosítás bank-igazítás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-okositas-bank-igazitas.md`. Munkakönyvtár: `source/`. Ág: `fix/okositas-bank-igazitas`.

1. **Új modul `server/improve/align-html-bank.ts`:** `alignHtmlLessonBank(html): { html: string; aligned: string[] }`.
   - `readRawHtmlLessonData(html)` try/catch-ben; hiba esetén `{ html, aligned: [] }`.
   - `experience.tasks` tömb minden elemére: ha `typeof sample === "string"`, a `required` string[][] és a `minWords` szám, akkor
     `alignTaskToSample(task)`.
     - Az `aligned` listába az az id kerül, amelynek rubrikája ténylegesen változott (JSON-összevetés előtte / utána).
   - Ha az `aligned` nem üres: `writeHtmlLessonData(html, data)`.
2. **`server/improveAsync.ts`:** közvetlenül a `verifyLessonMethodHtml` előtt `improvedHtml = alignHtmlLessonBank(improvedHtml).html`
   (naplózza az igazított id-kat).
   - Az `ImproveOutputError` hordozza a problémalistát (`problems: string[]`, alapból üres).
   - A `processImprovementJob` az újrapróbának `previousProblems`-ként adja át.
   - A `processImprovementCore` `opts.previousProblems` esetén a felhasználói promptba (az EGYEDI UTASÍTÁSOK után) egy „AZ ELŐZŐ
     PRÓBA ZÁRÓ ELLENŐRZÉSÉNEK HIBÁI” szakaszt tesz, legfeljebb 4000 karakterrel.
3. **`shared/lesson-html-data.ts` `HTML_LESSON_DATA_CONTRACT`:** a tasks sorában „legalább egy oral és egy written” →
   „MINDEN bankPlan-csomagban legalább max(2,fogalomszám) nyílt feladat, köztük legalább egy oral és egy written”.
4. **Teszt `tests/improve-align-html-bank.test.ts`:**
   - ragozott mintájú feladat → igazítva, a kapu mintaválasz-hibája eltűnik;
   - a HTML a JSON-on kívül változatlan;
   - olvashatatlan bank → érintetlen;
   - a szerződés szövege tartalmazza a csomagonkénti szabályt;
   - forrásszintű ellenőrzés: az `improveAsync` az igazítást a kapu előtt hívja, és a `previousProblems` a promptba kerül.
5. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
6. **Kitelepítés:** összevonás előtt az aktív-futás őr = 0.
