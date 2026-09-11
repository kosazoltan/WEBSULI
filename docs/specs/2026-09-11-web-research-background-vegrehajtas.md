# Végrehajtás
1. A meglévő generáló ciklust emeld külön futtatóba; ugyanaz a prompt, szigorú kapu, két javító kör és időkeret marad. Az események ne függjenek Response-tól. A régi SSE út ezt használja.
2. Készíts befecskendezhető job-store/worker határt a meglévő ai_generation_requests táblával. Indítás ütközés esetén csak azonos tulajdonos+bemenethez térjen vissza. Állapotok és a publikálás tranzakciója legyen tesztelhető. A szerver ment; a kliens csak eredményt olvas.
3. Új 202-indítás és rövid GET-követés. A kliens őrizze a futásazonosítót, újratöltéskor folytassa a követést. Ideiglenes hálózati hiba ne indítsa újra a készítést.
4. JSON-kapunál őrizd meg a Zod hibautat és üzenetet, de ne a teljes kérés/titok tartalmát. A minőségkövetelmény nem változhat.
5. Futtass célzott teszteket, lint/typecheck és Chrome regressziót; önreview, PR és teljes CI, kiadás. Végül tényleges AI-futás a Chrome felületen, új anyag visszaolvasása és a négy lap, pontozás, ékezetek és mobil megjelenés ellenőrzése.
