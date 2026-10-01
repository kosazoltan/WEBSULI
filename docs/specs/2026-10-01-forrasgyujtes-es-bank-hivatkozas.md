# Forrásgyűjtés több oldalra + bankban maradó tananyag-hivatkozás (2026-10-01)

**Mért ok** (élő Egyiptom-futás a0d0bf35, main e2638ae):
1. A webes keresés 15 találatot adott, de csak 1 oldal töltődött le (`sourceCount: 15, fetched: 1`). Ok: a gyűjtő utasítás
   3. pontja („kész, ha legalább egy … oldal le van töltve”) és a `decideWebResearchGatherResult` (`fetchedCount >= 1` → kész).
2. Egy rossz kvízválasz visszajelzésében („A tananyag nem a fáraók korához kapcsolja a kő előkerülését.”) a forrás-hivatkozás
   bennmaradt: az átíró „forrást igényel” jelzést adott, a program ilyenkor az eredetit hagyja. A bank 7. szabálya a forrásra/
   füzetre hivatkozást tiltja, a „tananyagra” hivatkozást nem.

**Cél / szabály:**
1. Forrásgyűjtés: a cél legalább 3 letöltött, témához tartozó oldal (`MIN_FETCHED_SOURCES = 3`). 1–2 letöltött oldalnál EGY
   célzott újrakérés („tölts le még … oldalt a találatok közül”); ha ezután is kevesebb, a gyűjtés a meglévővel kész (nem bukik).
   0 letöltött oldal: a régi viselkedés. Az utasítás 3. pontja ugyanezt mondja.
2. Bank: a 7. szabály a „tananyagra” hivatkozást is tiltja. Ha a bankban mégis marad ilyen, és az átíró „forrást igényel”
   jelzést ad egy HIBÁS válaszlehetőség visszajelzésére (`feedbackPerOption[i]`, `i ≠ correctIndex`), a program semleges, helyes
   visszajelzést tesz be („Nem ez a helyes válasz — olvasd el újra a fejezet magyarázatát.”); más mezőnél a figyelmeztetés marad.

**Nem-cél:** a keresőmodell, a kivonatolás, a tanítás szövegének forrás-hivatkozás-kezelése.

**Elfogadás (EARS):** HA a gyűjtés 1–2 oldallal áll meg és van még javítási kísérlet, AKKOR újrakérés; HA ≥ 3, vagy a kísérlet
elfogyott, AKKOR kész. HA a bank-átíró „forrást igényel” jelzést ad hibás opció visszajelzésére, AKKOR a semleges visszajelzés
kerül be, és a lecke nem hordoz tananyag-hivatkozást.
