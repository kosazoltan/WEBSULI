# Rövid fogalomnév megalapozása II — ékezetes rövid szó („Őz”) és nagybetűs elöljáró („AT / ON / IN”)

Állapot: ciklus 8 (2026-10-21) mért gyártási hibái; a tulajdonosi állandó megbízás („minden mért gyártási hibát javíts”) része.
Előzmény: `docs/specs/2026-10-19-rovid-fogalom-megalapozas.md` (a rövid nevű fogalom saját szabálya, `shortTermGrounded`).

## Mérés (éles, csak olvasva — `studio_jobs.output.singleRun`, `km_concepts`)
- **Az Erdő** (job 952d0101, 3. célzott kör): „3 fogalom-címkét a blokk saját szövege nem támaszt alá: oz („Őz”) a 36. explain …”.
  A 36. blokk: „Őz: Növényevő. … Kecses test, hosszú lábak, rövid farok. A hímnek kis agancsa van. … bak (hím), suta (nőstény), gida
  (utód).” — a fogalom definíciója szinte szó szerint. A szerző a visszajelzésre „(nem oz!)” betoldásokat írt a szövegbe (minőségromlás).
- **Időhatározói elöljárószók** (job 8bc212f4): „7 fogalom-címkét … nem támaszt alá: prep-at („AT”), prep-on („ON”), prep-in („IN”)
  a 40. explain blokkon …”. A 40. blokk: „AT: Pontos időpont, étkezés, éjszaka előtt: at 5 o'clock, at noon …”; a 41. példa: „in summer,
  on Friday morning, at midnight”. A térkép: `quote` = „AT = óra, noon, night, weekend.”, a példák a `definition`-ben („at noon”).

## Gyökérok (`server/studio/grounding.ts`)
- A `normalizeText` ékezetlenít: „Őz” → „oz” (2 betű) → a `shortTermGrounded` szabály kapja, amely az angol névelőkre („a”, „an”)
  készült: csak a forrásidézet ≥ 2 szavas PÉLDÁJA vagy idézőjeles / kiemelt név + definíció-szavak fogadhatók el.
- „Őz”-nél az idézet egyik szakasza sem tartalmazza a nevet önálló szóként ≥ 2 szóval, és a blokk nem teszi idézőjelbe → mindig hamis.
- „AT / ON / IN”-nél az idézet összefoglaló képlet („AT = …”, a `=`-es szakasz kimarad, a többi egyszavas) → nincs példa; a valódi
  példák a definícióban vannak, de azokat a szabály nem nézi; a „AT:” címkeforma nem számít megkülönböztető jelölésnek.

## Cél
1. **Ékezetes rövid név** (a kisbetűs név nem csak a–z / 0–9 betűkből áll, pl. „őz”, „íj”, „ős”): nem téveszthető össze a
   gyakori ASCII funkciószavakkal → a rendes rövid szó szabálya: az ÉKEZETES alak (kisbetűsítve, NFC) egy blokkbeli szó elején
   (ragozott alak: „őzek”, „őzet”). A „< 4 szó” védelem változatlanul előtte fut.
2. **ASCII rövid név** (a, an, at, on, in): a forrás-példák a `quote` MELLETT a `definition` szakaszaiból is („at noon”, „in summer”);
   a szabály ugyanaz (≥ 2 szó, szóhatáros, `=`-es szakasz nem példa).
3. **Megkülönböztető jelölés:** az idézőjeles / kiemelt alak mellett a CSUPA NAGYBETŰS név (≥ 2 betű, pl. „AT”) nagybetűs, önálló
   előfordulása is — utána a definíció-szavak fele (változatlan).

## Nem-cél
A „a” / „an” testvérfogalmak szigora (review #326) — változatlan: kisbetűs, ASCII névnél a nagybetűs ág nem fut; a definíció-tartalék
csak megkülönböztető jelöléssel. A 3 betűs küszöb, a képlet-ág, az idézetszám-tartalék — változatlan.

## Edge case-ek
- „Az” (magyar névelő) mint fogalom: ASCII → a szigorú ág; a mondat eleji „Az” nem csupa nagybetű → nem jelölés.
- Angol szövegben a köznapi „in London”: az „IN” fogalmat csak a definíció / idézet saját példája („in July”) vagy a nagybetűs „IN”
  + a definíció-szavak fele alapozza meg.
- Ékezetes rövid név, ha a blokk csak ékezet nélkül írja („oz”): nem megalapozott (helyesírási hiba nem taníthat).

## Célzott újragyártás
`LEGACY_REDO`: + az elöljárós anyag (345a84d9-…), utasítással; `LEGACY_REDO_ROUND` 3 → 4 (Az Erdő és az elöljárós anyag hibás sora
újra fut; a többi listás anyag már kész, nem érintett — a `shouldRedo` csak hibás sort indít).

## Elfogadás (EARS)
- HA a fogalom neve ékezetes rövid szó, és a blokk a nevet (ragozva is) ékezetesen tartalmazza, AKKOR a címke megalapozott.
- HA a fogalom neve ASCII rövid szó, és a definíció egy ≥ 2 szavas, a nevet tartalmazó példája szóhatárosan a blokkban áll, AKKOR megalapozott.
- HA a név csupa nagybetűs, nagybetűsen önállóan áll a blokkban, és a definíció-szavak fele is, AKKOR megalapozott.
- A „a” / „an” testvér-esetek és a 2026-10-19-es tesztek változatlanul zöldek.
- A két mért job 40–41. és 36–39. blokkjára a kapu nem jelez hamis hiányt (offline mérés a mentett szerzői körökön).
