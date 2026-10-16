# Bővülő szinonimaszótár (válaszbank) — mérés terve (2026-10-16)

Tulajdonosi javaslat (2026-10-15):
- A meglévő tananyagokból folyamatosan bővülő egyenértékűségi szótár épüljön: azonos, rokon és hasonló értelmű szavak.
- Ebből válogasson a lektor és a pontozó, így kevesebb tokennel, determinisztikusan fogadja el a más szóval mondott helyes választ.

Kapcsolódó:
- `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md`: a T2 után maradt 298 bukó helyes válasz 52%-a „nincs rokon szó” osztályú;
- a fő terv D4/T8 része (lektor-memória), és a T4′ nyelvi adatbank (`shared/hu-lexicon.ts`).

## Kérdés
Mennyit oldana meg egy gyártásokból tanult szótár egy ÚJ leckén, és nő-e közben a hibás átengedés?

## Módszer (modellhívás és DB-írás nélkül)
- Adat: a T2.0 mérés 4 jobjának 188 feladata, a mentett helyes és hibás tesztválaszokkal (mint a T3.0-nál).
- **Tanulás (szótárépítés):** egy helyes tesztválasz akkor ad bejegyzést, ha a kalibrált rubrikából pontosan EGY csoport hiányzik belőle,
  és a válaszban pontosan egy „új” tartalmi szó van. Új az a szó, amely nem szerepel:
  - a mintában;
  - a kérdésben;
  - egyik rubrikacsoportban sem;
  - a kötőszó- és tiltólistán.

  A bejegyzés: (a hiányzó csoport tagjai ↔ az új szó), a tantárgy nevével. A szóalakok szótöve a meglévő pontozó toldaléklevágásával képződik.
- **Kiértékelés: „egy jobot kihagyunk”.** A szótár a másik 3 jobból épül, és a kihagyott job feladatain mérjük. Három változat:
  - **(a)** minden bejegyzés;
  - **(b)** csak az azonos tantárgy bejegyzései;
  - **(c)** felső becslés: az azonos job MÁS feladataiból tanult szótár. Ez a „sok lecke után ugyanabban a témában” állapotot közelíti.
- **Alkalmazás:** a szótár a hiányzó csoportot a válasz szótárbeli szavával egészíti ki. A pontozó változatlan (v1).

  Őr feladatonként: a minta `ok` marad, és egyik ismert hibás válasz sem lesz `ok`. Ha sérül, az a szótárbejegyzés annál a feladatnál nem érvényes.
- **Mért értékek változatonként:**
  - bukó helyes válaszok (alapvonal: 298);
  - hibás átengedés (alapvonal: 18);
  - szótárméret.

  Emellett csak olvasva: az élő `arbiter_verdicts` táblában hány „helyes” ítélet van, ami jövőbeli tanulási forrás lenne.

## Döntési küszöb (javaslat a tulajdonosnak)
Az építés (T8a) akkor éri meg, ha a (b) változat legalább 15%-kal csökkenti a bukó helyes válaszokat, és a hibás átengedés nem nő.
Ha csak a (c) éri el, a szótár témánként, hosszabb idő alatt hasznosul: ekkor a döntőbírói ítéletekből tanuló, tantárgyhoz kötött változat jöhet szóba.

## Nem-cél
Termékkód, pontozó- vagy promptváltozás. Ez csak mérés.
