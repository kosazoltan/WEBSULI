# Végrehajtás — forrásgyűjtés több oldalra + bank-hivatkozás

1. `server/studio/web-research-agent.ts`: `MIN_FETCHED_SOURCES = 3`; `decideWebResearchGatherResult`: `fetchedCount >= 3` → kész;
   1–2 és `repairAttempts < MAX_ARTIFACT_REPAIRS` → `retry` (utasítás: tölts le még legalább N oldalt a találatokból);
   1–2 és elfogyott → kész; 0 → változatlan. A gyűjtő utasítás 3. pontja: legalább 3 oldal.
2. `shared/lesson-experience.ts` `bankPacketContract` 7. szabály: „tananyagra” hivatkozás is tilos.
3. `server/studio/source-reference.ts` `rewriteSourceReferences`: `experienceOnly` hatókörben a „forrást igényel” hibás-opció
   visszajelzés → semleges szöveg (`neutralFeedback`), számolva (`neutralized`); a hívó naplózza.
4. Tesztek: gyűjtési döntés (0/1/2/3 oldal, kísérlet elfogyott); semleges visszajelzés (hibás opció → csere, helyes opció → marad).
   Ellenőrzés: tsc, eslint, teljes unit; status-sor.
