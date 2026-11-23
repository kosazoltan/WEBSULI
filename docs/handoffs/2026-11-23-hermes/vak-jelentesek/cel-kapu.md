# Cél (tulajdonosi követelmény)

A `gate:pr` böngészős lépése csak azokat a teszteket futtassa, amelyek a változott komponens nevét önálló azonosítóként említik
(terv: `docs/specs/2026-11-23-kapu-spec-valasztas-szohatar.md`). Ok: az adventi PR-C `sync.ts` fájlja miatt a részszó-keresés mind a
83 tesztet kiválasztotta (`async`), a futás kifutott az időkeretből, a PR-kapu nem lehetett zöld.

Blokkoló az, ami a kaput GYENGÍTI: ha a változás után egy olyan teszt kimarad, amely a változott komponenst valóban gyakorolja, és
korábban (jogosan) futott; ha a változott spec-fájl nem fut; ha a játék-ág kiválasztása megváltozik; ha a mintává alakítás hibás
bemenetre kivételt dob vagy mindent / semmit választ.

Keress:
- olyan valós hivatkozási alakot a `source/tests/*.spec.ts` fájlokban, amelyet a szóhatáros egyezés elveszít (pl. a komponens neve
  ragozva, összetett azonosító részeként, `data-testid`-ben, útvonalban, kis- / nagybetű eltéréssel);
- különleges karaktert tartalmazó fájltövet, amely hibás reguláris kifejezést ad;
- a `pickE2eSpecs` többi ágának (játék, változott spec, „nincs egy spec sem” figyelmeztetés) nem szándékolt változását;
- a teszt valódiságát: a régi szabállyal bukik-e az új teszt.

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.
