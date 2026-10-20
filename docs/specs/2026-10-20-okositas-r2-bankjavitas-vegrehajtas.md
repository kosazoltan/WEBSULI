# R2 — HTML-okosítás bankjavítás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-okositas-r2-bankjavitas.md`. Munkakönyvtár: `source/`. Ág: `fix/okositas-r2-bankjavitas`.

1. **`server/improve/align-html-bank.ts`:** az `alignHtmlLessonBank(html)` visszatérési értéke kiegészül, a meglévő mezők
   megmaradnak (a hívó és a régi tesztek miatt):
   - `aligned` (változatlan);
   - `narrowed: string[]`;
   - `modeFlipped: string[]`;
   - `dropped: string[]`.
2. **A lépések a meglévő igazítás után:**
   - **Csomaghatár:** a `bankPlan.units` fejezetenként; minden `methods` / `tasks` / `quiz` tételre:
     - ha nincs olyan unit (azonos `sectionIndex`), amelyik minden `coversConceptIds`-t tartalmaz, és az első id egy unitban
       benne van → szűkítés arra a unitra (sorrendtartó szűrés);
     - a kvíztételnél csak az első id marad.
   - **Mód-egyensúly:** unitonként a hozzá tartozó feladatok (azonos `sectionIndex`, minden fogalom a unitban); ≥ 2 feladat és
     egyféle mód → az utolsó módja a másik.
   - **Elhagyás:**
     - minden sémahelyes feladatra, amelyre `evaluateOpenAnswer(sample, t).score !== 1`: próbakivétel;
     - `htmlLessonDataSchema.safeParse` hibaüzenet-halmaz előtte és utána; ha nincs új üzenet → végleges kivétel;
     - különben visszarakás.
3. **`server/improveAsync.ts`:** a napló a négy listát írja ki (a meglévő `aligned` naplósor kiterjesztése).
4. **Tesztek — `tests/okositas-r2-bankjavitas.test.ts`** (a `tests/improve-align-html-bank.test.ts` `htmlDocument()`-mintájára):
   - két csomagba nyúló tétel → szűkítve, a `verifyLessonMethodHtml` nem jelez csomaghiba-üzenetet;
   - mind írásos csomag → egy szóbeli lesz;
   - mintára sem teljes pontos feladat, amelynek kivétele nem sért padlót → kikerül; padlót sértőnél → marad;
   - hibátlan bank → bájtra azonos.
5. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
6. **Kitelepítés:** az aktív-futás őr = 0.

## Review #332 — pontosítás
- **Kvíz:** a kvízkérdést NEM szűkítjük. A kérdés több fogalmat kérdezhet, a hamis címke a tanulói kiértékelést torzítaná; a kapu
  jelenti, és a hibalistás újrapróba javítja. Csak a módszer és a feladat szűkül.
- **Módváltás:**
  - a csomag utolsó, saját mintáján teljes pontos feladata vált (a hibás mintájú így még elhagyható);
  - szóbeliből írásosra csak akkor, ha a globális öt szóbeli minimum megmarad.
- **Elhagyás:** az üzenetszámláló mellett KIFEJEZETT minimum-ellenőrzés kell (az összevont sémaüzenet egy meglévő hiánnyal elfedné
  az újat):
  - legalább 45 feladat;
  - legalább 5 szóbeli;
  - csomagonként max(2, fogalomszám) feladat;
  - a meglévő mód és fogalom nem tűnhet el a csomagból.
- **Regressziós tesztek:** 45/74 eset, módváltás + elhagyás együtt, szóbeli minimum.
