# Végrehajtás

1. Futtasd a helyi `generation-backup.local.mts` mentést és `generation-restore.local.mts` elkülönített visszaállítási próbát a source mappából. Elvárt: érvényes archívum és olvasható visszaállított táblák.
2. A `plant-source-repair.local.mts` alapállapotban csak olvasson. A kijelölt hibás térképet és 36 fogalmát mentse helyben. A fotókon egyértelműen látott szövegpárokat a fájlonkénti átiraton, term, definition és quote mezőkön alkalmazza; fogalmat ne töröljön és ne adjon hozzá. Írja ki a változáslistát. Futtassa a meglévő idézet- és jóváhagyási kaput.
3. Ellenőrizd a dry-run változáslistát a négy fotóval. `--apply` esetén tranzakcióban zárolt, egyező kiinduló állapotból cserélje a cache-hivatkozást és hozzon létre új térképet/új fogalmakat. A jóváhagyás a valóban lefutott kapu eredménye legyen. Elvárt: 36/36 visszaolvasott, idézetigazolt fogalom és változatlan eredeti publikált lecke.
4. A kiadott program normál feltöltési felületén indíts új gyártást ugyanazzal a négy fotóval. Várd meg és olvasd vissza a tényleges új publikációt, majd futtasd a kész lecke teljes adat- és Chrome-próbáját.
