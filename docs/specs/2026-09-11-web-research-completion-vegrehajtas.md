# Végrehajtás — internetes tananyagkészítés

1. Olvasd a gyártási skillt és `docs/lesson-improvement.md` szerződést; a kliens → SSE → Anthropic → HTML-kapu → mentés valódi útját kövesd.
2. Mentsd a régi szolgáltatói kérés mérését helyi, ignorált diagnosztikába: idő, stop_reason, tokenhasználat, forrásszám, HTML jelenléte. Kulcsot és privát azonosítót ne naplózz.
3. Írj futtatott regressziót a csak összefoglalót adó válaszra, a pause_turn kontextusára, limit/elutasítás/hibás bank esetére, hiányos SSE-re és új kérés régi HTML-jére.
4. Vezess be explicit készítési eredményt és korlátos folytatást/javítást, a kapu változatlan szigorával. Csak érvényes dokumentum a generálás sikere; a mentés saját szerveres visszaigazolást igényel.
5. A kliens törölje az előző jelölt aktív állapotát új kéréskor, ellenőrizze a végállapotot, automatikusan mentse a kész HTML-t, mutassa a hivatkozást vagy tartós, újrapróbálható hibát.
6. Célzott tesztek, teljes verify PR előtt; a böngészős teszt saját, izolált környezetet használjon. Ne indíts Express szervert éles DATABASE_URL mellett.
7. Valós szolgáltatói és Chrome ellenőrzés ugyanazzal az angolos kéréssel, forrás- és tartalmi ellenőrzés, telefon mindkét tájolással. Dokumentáld a tényleges eredményeket és minden maradó korlátot.
8. Diff önreview, atomi commit, PR CI; mentés/visszaállítási pont és futó gyártás ellenőrzése után a már engedélyezett merge/push/deploy. Éles URL és adat visszaolvasása nélkül ne jelents befejezést.
