# A lista a tanuló évfolyamára szűrve nyílik — terv

**Tulajdonosi jelzés (2026-10-18):** „Léna beírta a nevét. Három ötödikes tantárgyat föl is dobtál neki, utána pedig a negyedik
osztályt jelenítetted meg neki a többi tananyagként, holott ő már ötödikes.”

## Ok (kódból)
- **Az üdvözlő kártya** (`WelcomeCard`) a tárolt évfolyamból (`websuli.classroomGrade`) ajánl, ez helyes.
- **A lista** (`UserFileList`) viszont mindig „Mind” szűrővel indul (`selectedClassroom = null`). A tanmenet szerinti rendezés így
  minden évfolyam „mai” anyagát előre teszi, ezért egy ötödikesnek elöl 4. osztályos anyagok jelennek meg.

## Döntés
- Ha a tanulónak van tárolt évfolyama, a lista erre szűrve nyílik.
- Ha a tanuló az üdvözlő kártyán évfolyamot ad meg vagy módosít, a lista arra vált.
- A „Mind” gomb továbbra is minden anyagot mutat: ez a tanuló szándékos választása, és a munkamenetben megmarad.
- Évfolyam nélkül (vagy olyan évfolyamnál, amelyen nincs anyag) a lista „Mind”.

## Elfogadás (EARS)
- HA a tanuló évfolyama 5, AKKOR a lista első megjelenésekor csak 5. osztályos anyagok látszanak, és az 5. jelvény aktív.
- HA a tanuló az üdvözlő kártyán évfolyamot vált, AKKOR a lista szűrője is arra vált.
- HA a tanuló a „Mind”-ot választja, AKKOR minden évfolyam látszik.
