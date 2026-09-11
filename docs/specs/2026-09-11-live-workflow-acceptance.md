# Valódi tananyag-folyamat átvételi ellenőrzése

Cél: tulajdonosi kérésre valódi feltöltésből készítés, javítójelölt, alkalmazás és visszaolvasás, valamint megszakítás utáni folytatás ellenőrzése.
Nem cél: éles szerver szándékos leállítása, meglévő tananyag tömeges átírása, új munkasor fejlesztése.

Hatókör: elkülönített, TESZT jelzésű rövid háromszög-terület forrás a normál adminfeltöltőben; szerveres napló és adatbázis csak olvasási ellenőrzése; ugyanennek az anyagnak javítása. A forrás tantárgyát/évfolyamát a program állapítja meg.

Kockázat: szolgáltatói AI-hívások és legfeljebb egy új tesztanyag a katalógusban. Meglévő anyagot nem módosítunk. Alkalmazás előtt az eredeti JSON/metaadat és bank helyi mentése, majd az alkalmazás beépített tranzakciós mentésének ellenőrzése. Titok nem kerül evidenciába. Éles szerverleállás helyett a folyamatvesztést eldobható adatbázison vizsgáljuk, elkülönítve az éles böngésző-megszakítástól.

Elfogadás:
- Ha érvényes forrást töltünk fel, a futás eredménye valódi, visszaolvasott és megnyitható tananyag vagy konkrét hiba; ígéret nem siker.
- Ha a böngészőlapot a gyártás alatt újratöltjük, azonos futás követhető, nem indul második publikálás.
- Ha javítást kérünk, az eredeti változatlan marad az alkalmazásig; alkalmazás után a bank és tartalom visszaolvasható és van mentés.
- Ha végrehajtó megszakad, a kész checkpoint megmarad és pontosan azonos bemenettel felhasználható; a befejezetlen hívás automatikus újraindítását csak tényleges bizonyíték alapján állítjuk.
- A négy tanulási lap, feladat/kvíz és mobil álló/fekvő megjelenés valódi böngészőben ellenőrzendő.

Evidencia: docs/handoffs/2026-09-11-live-workflow-acceptance.md; helyi részletek tmp/workflow-acceptance/.
