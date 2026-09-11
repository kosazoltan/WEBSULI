# Végrehajtás

1. Készíts valós /preview útvonalat betöltő hálózati fixture-próbát, benne dokumentumgörgetés és lapváltás után elementFromPoint alapú takarásvizsgálattal. Igazold, hogy a jelenlegi fix előnézeti fejlécen elbukik.
2. Kizárólag a strukturált lecke eszközsávját és tartóját engedd normál dokumentumfolyamba. Az iframe-es ág maradjon változatlan.
   Az újratöltést a strukturált lecke query-jére irányítsd, az új lapot a valós előnézeti URL-re. Külön tesztben frissített JSON-t és megnyitott URL-t is ellenőrizz; az iframe abszolút címe ne kapjon újabb origint.
3. Futtasd a háromméretes célzott próbát, típusellenőrzést és lintet. Nézd meg a teljes képeket; az éles próba is ellenőrizze a takarásmentes lapfüleket és a tényleges képi állapotot.
4. Kis PR, zöld CI, merge és a telepített commit egyezése. A már alkalmazott mintaleckét ne alkalmazd újra; csak olvasd vissza és ellenőrizd az éles megjelenítését.
