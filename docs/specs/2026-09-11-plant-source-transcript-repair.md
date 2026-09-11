# Növényes forrásátirat forráshű javítása

## Cél és bizonyíték
A négy eredeti, 10–13. tankönyvoldalt ábrázoló fotót megnyitottuk és összevetettük a tárolt fogalmakkal. A képeken gyökérzet, kocsánnyal, hosszában, ivarlevelei, ivarlevél, védik, csészét, sziromlevelek, virágporszem, bibére, bibe, fejlődésnek, szélporozta és virágporát olvasható; az átirat több helyen eltér. Ezek szövegfelismerési hibák, nem a tankönyv szakmai állításainak felülírásai. A levél mondatában „növény testét” és „cukrokat” szerepel.

## Hatókör és eljárás
Egyszeri, helyi, titkot nem naplózó karbantartás. A 36 fogalom azonosítói, súlyai, kapcsolatai és automatikus évfolyam-besorolása megmarad. A hibás átiratú jóváhagyott fogalmakat nem írjuk át: új térképmásolat készül javított fájlonkénti átirattal és idézetekkel. Az eredeti feltöltés cache-kulcsa az ellenőrzött másolatra kerül, a korábbi térkép történeti hash-t kap. A régi tananyag és a lezárt hibás futás változatlan marad.

Érintett adat: egy knowledge_maps cache-hivatkozás, egy új knowledge_maps és 36 új km_concepts rekord. Helyi karbantartó: `source/plant-source-repair.local.mts` (nem commitolt). A fotók ellenőrzött javítópárjai és minden változás a helyi dry-run JSON-ban megmaradnak. A programban nincs növényes, konkrét szóra szabott kivétel.

## Elfogadás és kockázatkezelés
- Előbb teljes visszaállítható adatmentés és csak olvasó dry-run; a régi sorok teljes helyi pillanatképe.
- Minden javított idézet a saját fájljának javított, fotóról ellenőrzött átiratában szerepel; a meglévő checkVerbatim és jóváhagyási kapu fut. 36/36 megtartott fogalom, a súlyok változatlanok.
- Tranzakció és kiinduló tartalom/hash egyezés; futó, érintett gyártás mellett nincs alkalmazás. Sem tananyag-, sem kvízsor nem módosul.
- Visszaállítás a mentett régi hash-várakozásból, csak ha a javított állapot azóta nem változott. Új referenciák esetén nincs törlés; a javított másolat történeti megőrzéssel leválasztható.
- Alkalmazás utáni visszaolvasás, majd ugyanazon négy feltöltött fotóval normál automatikus gyártás. A minőségkapuk nem kerülhetők meg.
