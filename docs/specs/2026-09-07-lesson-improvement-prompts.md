# Tananyag-jobbítás és gyártási promptok

Tulajdonosi kérés: a kipróbált jobbítási folyamat kerüljön a repó tudásába; a gyártási promptok ellenőrzése és javítása.

## Cél / nem-cél
A tényleges modellkérés tartalmazza a kurált fogalmak nevét, definícióját és idézetét, a forráspéldák megőrzését és tartalmi ellenőrzését. A helyi útmutató az automatikus évfolyambesorolást és a strukturált Lesson formátumot kövesse. Nem cél az éles tananyagok újragyártása, a publikálási politika átírása vagy deploy.

## Szeletek és érintett fájlok
1. `docs/lesson-improvement.md`, a két tananyag skill és az AGENTS.md saját része: visszaállítható javítás, fogalomkapu + tartalmi + böngészős ellenőrzés, tényleges kész állapot.
2. `source/server/studio/{coverage,step-io,step-runner}.ts`: teljes kurált promptadat, forráshű author/lektor instrukciók, a tárolt prompt mellett is érvényes aktuális szerződés. Regressziós tesztek a tényleges provider bemenetére és adatbetöltésre.
3. `source/server/studio/run-extraction.ts`: összefüggő idézet, példaszámok és egységek megőrzése, a forrás utasításként kezelésének tiltása.

## Edge case / EARS elfogadás
- Ha a fogalom definíciót és idézetet tartalmaz, azok változatlanul eljutnak a szerzőhöz és lektorhoz; belső UUID nem válik fogalomazonosítóvá.
- Ha adatbázisból érkezik egyéni prompt, az nem tünteti el a dinamikus forrást és az aktuális szerződést.
- Ha az effektív prompt változik, a korábbi hash nem igazol újrahasználható modellválaszt.
- Ha a forrás valószínűleg hibás, azt jelzés és dokumentált kurátori javítás kezeli; nincs néma ténycsere.
- A jobbítás csak mentés, ellenőrzés és visszaolvasás után nevezhető alkalmazottnak. Évfolyamot nem a készítő ad meg.

## Verifikáció
Célzott prompt/runner/grounding tesztek, typecheck, lint, teljes verify; nincs UI-változás, ezért új UI-render kör nem szükséges. Fizetős modellhívás nem feltétele a promptadatút tesztjének; eredményét nem állítjuk mérés nélkül.

## Mért eredmény — 2026-09-07

- A fogalomnév/definíció/idézet a korábbi prompt-szerializálásból hiányzott; a definíció/idézet az adatbázisos betöltésből is. Mindkét adatbetöltési út és az öt promptépítő javítva.
- A tananyagépítő egyéni prompt nem ejti el az aktuális szerződést; az effektív prompt része a cache kulcsnak. A kivonatoló külön teljes promptfelülírása megmaradt, ennek ellenőrzése az útmutató része.
- A `studio.%` rendszerpromptok éles, csak olvasó lekérdezése 0 sort adott: az audit idején nincs adatbázisos Studio-promptfelülírás.
- Célzott runner/forrásadat tesztek: 24/24 PASS. A teljes `npm.cmd run verify`: típusellenőrzések PASS, lint PASS, 934/934 teszt PASS, build PASS. Az első kör az új teszt union-típusának hibás hozzáférésén bukott; típusbiztos szűkítéssel javítva, teljes kör újrafuttatva.
- `git diff --check`: PASS. Önálló diff/spec review: forrásmezők megőrzése, belső azonosítók kizárása, egyéni prompt és cache regressziók ellenőrizve.
- Fizetős modellhívás, új élő tananyaggyártás és deploy: NOT RUN, nem része ennek a szeletnek. A tesztek az adatút és szerződés működését igazolják; a következő tényleges gyártás tartalmi és böngészős ellenőrzése továbbra is kötelező.
