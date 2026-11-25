# A tananyag-változatosság alapból BE (V0)

Forrás: tulajdonosi döntés, 2026-11-24 (űrlap): „A változatosság bekapcsolása élesben: **azonnal minden új leckére**.” Előzmény: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md`. Az S5a–S6c szeletek a `STUDIO_LESSON_VARIETY=on` kapcsoló mögött már a main-en vannak:
- visszajelzés-nyitás;
- nyitásformák és hősnév;
- kevert módszersorrend;
- fejezetív-készlet;
- `try`-minimum és -forgatás, szerzői hangok;
- ábrafajta-terv.

## Változás
- `lessonVarietyEnabled`: az explicit `on` vagy `off` mindig nyer (kis- és nagybetű, szóköz mindegy; az `off` vészfék). Beállítás nélkül **élesben** (`NODE_ENV=production`, a `start` szkript) **BE**, tesztben és fejlesztésben a régi KI alap marad. Így a meglévő, a KI-ágat bájtra rögzítő tesztek változatlanok, a BE-ágat a célzott tesztek kapcsolják.
- A futás állapota továbbra is egyszer, az elején dől el (`lessonVarietyForRun`).
- Folytatásnál a mentett állapot dönt, így a régi, kapcsoló nélküli checkpoint KI marad. Ez nem változik.
- A KI-ág kódja és tesztje marad.

## Elfogadás
- E1: WHEN `NODE_ENV=production` és nincs beállítás (vagy az érték se nem `on`, se nem `off`) THEN BE. WHEN `off` THEN KI. WHEN `on` THEN BE.
- E2: WHEN nem éles környezet és nincs beállítás THEN KI (a régi viselkedés). A teljes egységtesztkör változatlanul zöld.
- E3: Régi checkpoint folytatása (mező nélkül) → KI (`lessonVarietyForRun`, változatlan).
