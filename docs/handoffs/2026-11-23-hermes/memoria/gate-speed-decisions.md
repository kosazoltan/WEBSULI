---
name: gate-speed-decisions
description: "A lassú merge-sor gyökérokai és a tulajdonos három döntése: C-61 gépi összefésült próba, bizonyíték-átvitel főág-beolvasztás után, vak körök korlátja; WIP-korlát és gép-zár (2026-11-19)"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-20T06:50:56.473Z
---

A tulajdonos 2026-11-19-én kötelező érvényű utasításban kérte a lassúság gyökérokának megszüntetését („folyton leálló, nem megfelelő
működés”), és kérdőíven három szabálymódosítást hagyott jóvá:

1. **C-61:** ha a főág elmozdult és a PR őrt / CI-fájlt érint, új teljes CI helyett a merge-kapu maga futtatja az őr-teszteket a
   PR + friss főág összefésült állapotán (fail-closed).
2. **Bizonyíték-átvitel:** ütközésmentes főág-beolvasztás után, ha szkript igazolja, hogy a PR saját változása bájtra azonos, a vak
   ítélet és a helyi kapuk bizonyítéka érvényes marad.
3. **Vak körök:** 1 teljes kör + célzott visszanézés; változatlan részben talált új, nem blokkoló lelet kanban-jegy; blokkoló mindig
   megállít. MÓDOSÍTVA 2026-11-19 este (űrlap): blokkoló / közepes javítása után a célzott GPT-visszanézés kérdés nélkül, automatikusan
   fut; ha egy PR 6 kör után is NEM, bontást / szűkítést javaslok űrlapon (a korábbi „3 kör után tulajdonosi döntés” helyett).

**Why:** mérve — egy főág-mozdulás minden kész, kapu-közeli PR-nak új 1,5–2 órás CI-t írt elő; a #517 (csak doksi) 6 vak kört futott;
12–15 párhuzamos szál egy gépen órákra megbénította a kapukat (03:36–06:36 egy PR-kapu sem indult; a gép-zárat 128 percig tartották
üresen / elakadva).

**How to apply:**
- Amíg a kapugyorsítás (`fix/kapu-gyorsitas`) nincs a főágon, a régi szabály él — ELLENŐRIZD a kódból, mielőtt hivatkozol rá.
- Az én (orkesztrátor) szabályom: legfeljebb 4 aktív munka egyszerre, merge-sorrendben; új szál csak akkor indul, ha egy befejeződött
  (összevonva). Először a CI-t / kapukat gyorsító PR megy.
- Nehéz kör (npm ci, teljes teszt, böngészős, gate:*) csak gép-zárral; a zárat csak olyan szkript kérheti, amely megszerzéskor azonnal
  fut, időkorláttal megszakít és mindenképp elengedi; folyamatot csak pontos PID alapján állítunk le.
- Kis PR-ok (≤ ~400 sor): a nagy PR több vak kört és több javítókört hoz.
- **EGY gépi sáv (tulajdonos, 2026-11-19 délután):** két párhuzamos nehéz kör alatt időzítésfüggő tesztek hamisan buktak (kanban
  #205, #206) → „vagy állítsd sorba őket, vagy javítsd meg a nehéz futás sikeres elvégzését”. Mindkettő: a második sáv (`lock2`)
  tartósan lezárva, a vak futtató böngészős / DB-eszközei is a gép-zár alá kerülnek, és a két tesztet determinisztikussá tesszük.
  Zárat csak a sorrendfájl első két sorában álló kérhet; a zárat megszerző szkript maga futtassa a kaput (különben üres zár marad).
- **Ne vesszen el munka határidő miatt (tulajdonos, 2026-11-20):** „ha van ilyen időkerete, akkor annak tudatában működtesd, és ne
  engedd, hogy elvesszenek a munkák”. Az orkesztrátori futtatóknak nincs időkerete (csak STOP-fájlra állnak le, pl. `vak-sor-2.sh`);
  egy felügyelő (`felugyelo.sh`) két percenként ellenőrzi, hogy a sor minden nevének van-e élő várakozója és fut-e a GPT-futtató, és
  eltérésnél azonnal ébreszt. Az ügynökök időkorlátos várakozóinál a lejárat előtt meg kell újítani őket.
- **Holtpont-csapda (2026-11-20 reggel, mérve):** ha egy ügynök lezárul, a várakozója eltűnik, de a neve a sor első két
  helyén marad, és mindenki mást blokkol (06:27–06:47 egy kapu sem indult). Ellenszer: a felügyelő jelzésére a várakozó
  nélküli neveket azonnal ki kell venni a sorból, és a kaput az orkesztrátor futtassa a `zar-futtat-2.sh`-val (nincs
  várakozási határideje, csak `gep-sav/STOP-<név>` fájlra áll le).
- **Ingadozó merge-próba:** „≤ 7 perc + 1 újrafuttatás” (a #205 megoldásáig egyszeri, jelölt újrafuttatás; a második bukás FAIL).
Kapcsolódó: [[quality-gates-mandate]], [[blind-bug-hunting-reviewer]], [[orchestrator-owns-all-websuli-flows]].
- **Egy soros kapu-futtató (2026-11-20, gépújraindítás után):** a sok párhuzamos zár-várakozó fork-hibáig terhelte a gépet, és
  lezáruló ügynöknél beragasztotta a sort. Helyette egyetlen leválasztott `kapu-sor.sh` fut a `kapu-feladatok.txt` alapján (a sor csak
  a futás UTÁN törlődik, így újraindításkor megmarad); az ügynökök nehéz kört csak sorhozzáfűzéssel kérhetnek.
