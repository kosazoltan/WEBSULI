# Végrehajtás
1. A mentett új tanítással futtasd az izolált első bankcsomagot; csak a helyi ignorált diagnosztikába ments modellválaszt. Azonosítsd a ténylegesen elbukó csoportot az értékelővel.
2. A közös pontozóban exportálj hiányzócsoport-lekérdezést a meglévő tokenizáló és illesztő használatával. A pontszámítás változatlan.
3. A banképítő hibájába foglald bele az elbukó tétel konkrét szinonimacsoportjait. A kezdeti prompt írja le a rövid/ragozott alakok kezelését. Marad az első válasz és egy célzott javító kör.
4. Teszteld a rövid, ragozott szó esetét, a hibás minta elutasítását, a javított teljes bankot. Futtasd a teljes izolált bankgyártást mentett ellenőrzőponttal, majd `npm.cmd run verify`.
5. Frissítsd a közös módszerleírást. Kódreview, zöld CI után merge/deploy; éles újragyártás a felületen, adat-visszaolvasás és négy lap valódi mobil/asztali próbája.
