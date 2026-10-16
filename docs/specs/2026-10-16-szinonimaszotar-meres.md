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

## Eredmény (2026-10-16)
Adat: `docs/measurements/2026-10-16-szinonimaszotar.json`. 188 feladat, 4 job, 4 különböző tantárgy (biológia, történelem, matematika, környezetismeret).

| Változat | Bukó helyes (alap: 298) | Hibás átmegy (alap: 18) | Alkalmazva / őr elutasította |
|---|---:|---:|---|
| (a) más jobokból tanult szótár | 298 | 18 | 4 / 0 feladat |
| (b) csak azonos tantárgy | 298 | 18 | 0 (nincs azonos tárgyú másik job) |
| (c) felső becslés: ugyanannak a jobnak más feladatai | 291 (−2,3%) | 18 | 42 / 26 feladat |

- **Lecke-közi átvitel nincs.** Más tantárgyból tanult szó nem segít, azonos tárgyú tanulóadat pedig most nincs.
- **A tanulás zajos.** 188 feladatból 18 bejegyzés lett, ezek egy része téves. Ilyen a „növény” ↔ „törő” és az „élén” ↔ „voltak”; az őr 26 feladatnál utasította el őket.
  A helyes válasz több szóban tér el a rubrikától, ezért egyetlen szópár ritkán javítja.
- **Döntőbírói forrás:** az `arbiter_verdicts` táblában élesben 1 „helyes” ítélet van. A tábla az adatminimalizálás miatt (T7) a válasz szövegét nem tárolja, így jelen formájában nem tanulási forrás.

**Következtetés:** a döntési küszöböt (a (b) változat ≥ 15%-os javulása) egyik változat sem éri el. Automatikusan bányászott szótárt most nem érdemes építeni.

A javaslat lehetséges folytatásai (tulajdonosi döntés):
- **(1) Halasztás:** újramérés, amikor tantárgyanként legalább 5–10 gyártás összegyűlt (a mérőeszköz kész).
- **(2) Tanulás a döntőbírótól:** a „helyes” ítéletnél a normalizált válasz és a feladat elmentése, tantárgyhoz kötve, kézi jóváhagyással a szótárba.
  Ez adatkezelési döntés: a T7 most szándékosan nem tárol választ.
- **(3) Gondozott szótár:** tantárgyanként egyszeri, modell által javasolt, ember által jóváhagyott szinonimacsoportok a `HU_SYNONYM_GROUPS`-ba. Ezt külön mérni kell.
