# S9 — Prompt-javító orkesztrátor (tulajdonosi tervezés, 2026-10-05)

Tulajdonosi döntés (a zárt akciólistás javaslatot elvetve): az orkesztrátor modell NEM választ egy listából, hanem
**elemzi a hibás szakaszt, és olyan promptot készít, amellyel az adott szerepkör (profil) modellje eredményesen végre tudja
hajtani a lépést**. Így a valós hiba javul, nem csak újrapróbálkozás történik. Modell: **DeepSeek v4.1 flash**
(`deepseek/deepseek-v4.1-flash`).

## Mért kiindulás (fájl:sor)
- A hibás lépés ma VAKON ismétlődik: a bankcsomagnál a hibalista szó szerint visszamegy, és a modell cserélődik
  (alap → tartalék → mentőmodell; `experience-builder.ts:379`, `step-runner.ts:1093`); a javító úton a szerző a nyers
  „Ellenőrzési hibák” szöveget kapja (`structured-improvement.ts:139`). Diagnózis és prompt-átírás nincs.
- Leállás hibánál: `engine.ts:244` („Ez a futás megállt; külön folytatási művelet szükséges”).
- A bukott kísérlet oka ma csak naplóba kerül (`step-runner.ts:1090`, `web-research-runner.ts:381`), a bukott kimenet sehol
  nem marad meg → a méréshez először rögzíteni kell (1. szelet).
- 52 bukott futás: bank_packet 12, infrastructure 9, bank_floor 6, factual 6, schema 6, coverage 5, other 5 (S0-mérés).

## Működés
1. **Belépési pont:** a szerep egy kísérlete elbukik a determinisztikus kapukon (séma, egy-helyes-válasz, hamis számítás,
   forrás-megalapozottság, lektor-blokkoló, bank-padló).
2. **Elemzés (orkesztrátor):** bemenet: a szerep neve és szerep-skillje, a bukott hívás rendszer- és felhasználói promptja,
   a bukott kimenet (a hibás részek körül vágva), a kapuk leletei, a releváns forrásrészlet, a korábbi orkesztrátor-diagnózisok
   (hogy ne ismételje magát). Kimenet: (a) **diagnózis** — melyik utasítást értette félre / mi hiányzott a promptból / hol
   ellentmondásos a feladat; (b) **javító prompt** — szabad szöveg a szerepnek: pontos, a hibára szabott utasítás, akár a
   feladat átfogalmazásával.
3. **Újrafuttatás:** ugyanaz a szerep, ugyanaz a modell-lánc; a rendszerprompt: szerep-skill (elöl, változatlan) → eredeti
   utasítás → `=== ORKESZTRÁTOR JAVÍTÓ UTASÍTÁS (v<hash>) ===` blokk (a végén, lost-in-the-middle ellen).
4. **Ellenőrzés:** az új kimenet UGYANAZOKON a kapukon megy át — ez a biztonsági határ, nem az orkesztrátor korlátozása.
5. **Ha megint bukik:** új elemzés a friss leletekkel (legfeljebb 2 orkesztrált kör pontonként, a javítási kereten belül —
   `workflowEnsureRepairBudget`), utána a meglévő mentőút (erős modell), végül admin a diagnózisokkal.
6. **Tanulás:** minden (tantárgy, szerep, lelet-kód, javító prompt, eredmény) rögzül; ami többször sikeres, az a tantárgyi
   memória (S5) kártyája és skill-szabály jelöltje lesz admin-jóváhagyással.

## Védőkorlátok (a modell gondolkodását nem szűkítik)
- A szerep-skill Tilalmai elsőbbek a javító utasításnál (a blokk fejléce ezt kimondja); a forrás-hűség kapui változatlanok.
- A javító prompt és a diagnózis a futás ellenőrzőpontjába mentődik (`workflowCheckpoint`) → folytatáskor ugyanaz, és a
  lépés-hashbe kerül.
- Költség: pontonként ≤ 2 orkesztrátor-hívás (olcsó modell) + az újrafuttatás; a keret a meglévő javítási keret.

## Szeletek
1. **Rögzítés:** a bukott kísérlet (prompt-hivatkozás, kimenet-kivonat, leletek) mentése a futás pillanatképébe — 0 modell.
2. **Orkesztrátor-mag:** `server/workflows/orchestrator.ts` — bemenet-összeállítás, prompt, válasz-séma (diagnózis +
   javító prompt), szerep-skill `orchestrator` — tisztán tesztelve, gyártásba nem kötve.
3. **Bekötés a bankcsomag-ciklusba** (a hibák zöme ott van) a tartalék-modell előtti kísérletként, kapcsolóval.
4. **Mérés:** ingyenes rész — az orkesztrátor diagnózisait a rögzített bukásokon kézi diagnózishoz mérjük; fizetős A/B
   (tulajdonosi engedéllyel): ugyanazon bukott pontokon a mai ismétlés vs. orkesztrált ismétlés sikeressége és költsége.
5. Kiterjesztés a szerző/lektor/javító útra, ha a mérés igazolja.

## Elfogadás (EARS)
- HA egy kísérlet elbukik, AKKOR a következő kísérlet a diagnózisra épülő javító promptot kapja, és a kapuk ítélete változatlan
  mércével dönt.
- Az orkesztrált kísérletek sikeressége a fizetős A/B-n jobb a mai ismétlésnél ugyanazon pontokon (cél: ≥ +25 százalékpont),
  kapukerülés 0.
- Folytatáskor a javító prompt nem generálódik újra (ellenőrzőpontból jön).
- Teljes unit, tsc, lint zöld; az S9 nélküli futás viselkedése kapcsoló kikapcsolt állapotában változatlan.
