# Szóbank — en — vak megoldós ellenőrzés

- **Dátum:** 2026-11-15
- **Gyártó modell:** Claude Sonnet 5.5 (öt párhuzamos alügynök, szintenként egy fájl); integrátor: Claude Opus 5.5
- **Megoldó modell:** Claude Opus 5.5 (szintenként egy független alügynök; a fix-körben egy újabb, független alügynök)
- **Seed:** 1115 (1. kör), 1116 (fix-kör)
- **Export-parancs (1. kör, szintenként):**
  `cd source && node --import tsx scripts/vocab-bank.ts blind-export --lang en --level <n> --seed 1115 --out <scratchpad>/s3-lead/full/blind-en-<n>.json --key-out <scratchpad>/s3-lead/full/blind-en-<n>.key.json --canary 10`
- **Pontozás:** `node --import tsx scripts/vocab-bank.ts blind-score --key blind-en-<n>.q1.key.json --answers blind-en-<n>.q1.answers.json --out blind-en-<n>.q1.flagged.json`

## Módszer

- **Szűkített q1-készlet.** A teljes export szintenként 1186–1719 kérdés (bejegyzésenként 2–3 típus). A megoldó terhelésének
  csökkentésére a kulcs alapján bejegyzésenként **pontosan egy** kérdés maradt: szavaknál a szinten belüli sorszám szerint
  váltakozva `target-to-hu` / `hu-to-target`, kifejezéseknél `target-to-hu` (a `phrase-meaning` típust a `blind-export` nem
  állítja elő); ahol a bejegyzésnek kanári-kérdése volt, az lett a kérdése. Mind a 10 kanári megmaradt; az L0-n egy bejegyzésre
  (`en0-weather-005`) két kanári esett, ezért ott 555 kérdés van 554 bejegyzésre. A kérdésfájl nem tartalmaz kulcsot,
  bejegyzés-azonosítót vagy kanári-jelölést (szkripttel ellenőrizve); a kulcs a megoldók számára nem látható mappában volt.
- **Megoldói szabály:** a megoldó előbb **csak a `prompt` + `options`** alapján választ, a példát (`example`, `exampleHu`) csak
  utána, az `exampleOk` megítéléséhez nézi. Ok: a példafordítás sok jelentéskérdésnél kiolvashatóvá tenné a helyes választ.
- **Szám–szöveg ellenőrzés:** a megoldók tételenként a választott opció szövegét is rögzítették (`chosen`), és szkripttel
  ellenőrizték, hogy `options[answer] === chosen` (indexcsúszás kizárása).
- **Kanári-kapu:** a pontozó csak a rontott kulcstól ténylegesen eltérő választ számítja észlelésnek; 10/10 kötelező.

## Eredmény

| Szint | Bejegyzés | Kérdés | Kanári | Jelzett (1. kör) | Valódi hiba | Javítva | Törölve+pótolva | Megoldói tévedés | Jelzett (utolsó kör) |
|---|---|---|---|---|---|---|---|---|---|
| L0 | 554 | 555 | 10/10 | 19 | 19 | 19 | 0 | 0 | 0 |
| L1 | 574 | 574 | 10/10 | 6 (+1 megjegyzés) | 7 | 7 | 0 | 0 | 0 |
| L2 | 566 | 566 | 10/10 | 5 (+6 SZINT-megjegyzés) | 11 | 5 | 6 | 0 | 1 |
| L3 | 560 | 560 | 10/10 | 18 | 18 | 18 | 0 | 0 | 0 |
| L4 | 410 | 410 | 10/10 | 18 | 18 | 17 | 1 | 0 | 0 |

„Jelzett (1. kör)” = a `blind-score` jelzése; a zárójelben a jelzés nélküli, de nem üres megjegyzéssel elbírált tételek.
„Törölve+pótolva” = azonos azonosítón, azonos cellában új term (a régi szó nem került máshová).

**Fix-kör (seed 1116):** a 85 javított / cserélt bejegyzés mindegyikére egy kérdés + 10 kanári nem érintett bejegyzésekből
(95 kérdés; szintenként 20 / 17 / 16 / 21 / 21). Eredmény: kanári 10/10, jelzett 1 (`en2-family-008`, példamondat), további
5 megjegyzés. Elbírálás: 4 javítva (lásd lent), 2 nem hiba (`en3-everyday-022` pick up B1-en marad: gyakori B1-es phrasal
verb; `en4-communication-010` a „grumble” elterelő nem azonos jelentésű). A fix-körben módosított 4 bejegyzést nem oldatták
meg újra: integrátori visszaolvasás történt.

## Jelzett tételek

### L0
- `en0-numbers-015` — „One hundred children are at the school.” / „…jár az iskolába” eltér — „There are one hundred children at the school.” / „Száz gyerek van az iskolában.”
- `en0-colors-015` — a „halvány” elterelő (pale) is védhető a light-ra — a pale jelentése „sápadt”, új példa („You look pale today.”).
- `en0-animals-027` — „kedvence van” félrevezető — „háziállata (házi kedvence) van”.
- `en0-weather-025` — „szeles van” hibás — „szeles az idő, fúj a szél”; „Fúj a szél, fogd meg a kalapodat!”
- `en0-feelings-017` — „Félek a sötétben” ≠ scared of the dark — „Félek a sötéttől.”
- `en0-time-008`, `en0-family-005`, `en0-family-012`, `en0-family-024`, `en0-numbers-009` — „… éves” különírva — egybeírva (tízéves, kilencéves, ötéves, hároméves).
- `en0-freetime-016` — „játékokat játszunk” tükörfordítás — „Iskola után játszunk valamit.”
- `en0-time-011` — „Ma angolórán vagyunk” pontatlan — „Ma van angolóránk.”
- `en0-colors-012` — „arany színű” ≠ anyag — „A korona aranyból van.”
- `en0-clothes-004` — „farmer” hamis barát a kérdésben — „farmernadrág”.
- `en0-animals-033` — „Monkeys climb a tree easily.” természetellenes — „Can you climb a tree?” / „Tudsz fára mászni?”
- `en0-home-034` — „Isten hozott otthon, mindenkit!” — „Isten hozott itthon mindenkit!”
- `en0-time-021` — „negyed (óra) után” nem természetes, a „negyed hat” elterelő maga is quarter past — „negyed … (pl. quarter past nine = negyed tíz)”, „Negyed tíz van.”; a konkrét időpont-bejegyzések cserélve (`en1-time-015/016`).
- `en0-time-020` — „fél (óra) múlva...” félrevezető — „fél … (pl. half past two = fél három)”.
- `en0-animals-022` — „kedvencem” = favourite — „A házi kedvencem egy kis nyuszi.”

### L1
- `en1-travel-009` — „lekésjük” — „lekéssük”.
- `en1-feelings-001` — „félő” pontatlan — „fél, megijedt”.
- `en1-animals-015` — kenguru „zsákja” — „erszényében”.
- `en1-colors-016` — „lilac flowers” = orgona — „Her dress is lilac.” / „A ruhája halványlila.”
- `en1-colors-007` — „violet flowers” = ibolya — „Her scarf is violet.” / „A sála ibolyakék.”
- `en1-health-002` — „Rossz köhögésem van” tükörfordítás — „Csúnyán köhögök.”
- `en1-clothes-026` — egyszeri eseményre present simple — „She lost an earring at the party.”

### L2
- `en2-family-010` ancestor, `en2-body-017` spine, `en2-weather-020` gale, `en2-body-011` knuckle, `en2-body-022` nostril, `en2-nature-025` glacier — A2-höz túl nehéz (SZINT) — cserélve: wedding, moustache, degree, freckles, curly, sunflower.
- `en2-everyday-031` — „Felteszek teavizet egy teához” — „Felteszem a vizet a teához.”
- `en2-family-008` — „öt éves” — „ötéves”; a fix-körben a példa is: „Their grandson is five years old.” / „A fiúunokájuk ötéves.”
- `en2-weather-019` — „meleg és párás van” — „meleg és párás az idő”.
- `en2-body-020` — „Próbálj nem körmöt rágni” — „Próbáld meg nem rágni a körmödet.”
- `en2-nature-011` — „cserépben” — „cserépbe”.

### L3
- `en3-feelings-017` — „tartja a lelket” = másban — „nem csügged, bizakodó marad”; „Próbálj bizakodó maradni.”
- `en3-culture-021` — „lesz megtartva” — „A koncert a parkban lesz.”
- `en3-family-007` — „a házi feladat miatt” — „ha a házi feladatról van szó”.
- `en3-feelings-008` — egyszeri ijedség ↔ tartós félelem — „Rettegtem a pókoktól.”
- `en3-work-013` — „van betöltetlenül” — „betöltetlen szakácsi állás van”.
- `en3-technology-024` — „Regisztrálnod kell egy fiókot” — fix-kör után: „Fiókot kell regisztrálnod.”
- `en3-weather-016` — „megvan” — „megtartják”; fix-kör után az angol is: „The festival goes ahead rain or shine.”
- `en3-family-009` — „A háztartásunk … zajos” természetellenes — „There are five people in our household.” / „A háztartásunkban öten élnek.”
- `en3-feelings-006` — eager to ≠ lelkesen tanul — „Nagyon szeretne új dolgokat tanulni.”
- `en3-communication-005` — „a focimeccsen” — „a focimeccs miatt”.
- `en3-everyday-022` — „Érte tudsz menni a gyerekeknek” — „El tudsz menni a gyerekekért négykor?”
- `en3-city-023` — „lebont” / „lebont (épületet)” két helyes opció — a hu betűre azonos („lebont”), a generátor kizárja egymás mellől.
- `en3-feelings-019` — „…az osztálytársaimmal” — „…az osztálytársaim között”.
- `en3-travel-002` — poggyász a kapunál — „from belt four” / „a négyes csomagszalagnál”.
- `en3-home-019` — „tömbház” regionális — „lakótömb, társasház”.
- `en3-feelings-024` — „nyugodt marad” elterelő (keep calm) védhető — take it easy: „lazít, nem hajszolja magát”.
- `en3-animals-008` — hawk ≠ sólyom — „héja, ölyv”.
- `en3-time-011` — „ezt követően” (subsequently) elterelő is helyes — a két hu betűre azonos („azután, utána”).
- `en3-food-019` — „bedug” elterelő (plug in) védhető a tuck in-re — plug in: „bedug (konnektorba)”.

### L4
- `en4-communication-010` — mutter / murmur két helyes opció — mindkét hu „motyog, mormol”.
- `en4-food-010` — „Ne edj” — „Ne egyél”.
- `en4-home-004` — „meghitt kényelmesnek” — „melegnek és meghittnek tűnt”.
- `en4-body-001` — „Eltört a végtagja” — „Eltörte az egyik végtagját”.
- `en4-family-008` — „elsodródnak” / „eltávolodnak” (grow apart) két helyes opció — a hu betűre azonos („eltávolodnak egymástól”).
- `en4-food-009` — „katasztrófa receptje” tükörfordítás — „biztos út a bajhoz”; „…ebből biztosan baj lesz.”
- `en4-culture-010` — patron = vásárló / törzsvendég is — cserélve: benefactor („jótevő, adományozó”).
- `en4-travel-022` — „kikapcsolódik, lazít” (chill out) védhető — „kiszakad a mindennapokból (elutazva)”.
- `en4-communication-023` — „felvette” múlt idő — „megkeres, felveszi a kapcsolatot”.
- `en4-time-008` — „az élet lehetősége” — „életre szóló lehetőség”.
- `en4-nature-013` — folyó „halad át” — „folyik át”.
- `en4-travel-020` — „rekedt” — „ott reked, ott ragad”.
- `en4-technology-020` — könyvek „az adatbázisban” — „keeps a record of its books” / „nyilván tartja”.
- `en4-body-005` — „véredény, vena” — „ér, véna”.
- `en4-shopping-013` — „szétveri a költségvetést” — „nagyon sokba kerül”; „nem kerül egy vagyonba”.
- `en4-clothes-003` — „testre szabott zakó” — „méretre szabott”.
- `en4-numbers-001` — „százalék(arány)” / „százalék” (per cent) — a hu betűre azonos („százalék”).
- `en4-body-003` — „megsérült egy ínat” — „megsértett egy inat”.

### Fix-kör
- `en2-family-008` — „Grandpa's grandson” önmagára utaló — „Their grandson is five years old.” / „A fiúunokájuk ötéves.”
- `en2-body-004` — „arc (orca)” zavaros elterelő-szöveg — „arc, orca”.
- `en3-weather-016` — „happens rain or shine” — „goes ahead rain or shine”.
- `en3-technology-024` — szabad fordítás — „Fiókot kell regisztrálnod.”

## Rendszerszintű javítások (a teljes angol bankon keresve)

| Típus | Darab | Példa |
|---|---|---|
| számnév + éves / hónapos egybeírás | 10 | tízéves, kéthónapos, ezeréves, tizennyolcévesen |
| „… van” melléknévvel időjárásra | 3 | szeles van, párás van |
| elírás | 4 | lekésjük, Ne edj, ínat, vena |
| időpont-kifejezés | 4 | half past, quarter past; half past two / quarter past five cserélve |
| színnév-példa virággal | 2 | lilac, violet |
| múlt idejű magyar jelentés | 4 | reach out to, have a cold, be named after, get stranded |
| két védhető opció (hu összehangolva / csere) | 10 | mutter–murmur, afterwards–subsequently, percentage–per cent, pull down–knock down, drift apart–grow apart, light–pale, tuck in–plug in, patron→benefactor, get away from it all–chill out, take it easy–keep calm |
| szintek közötti ismétlés | 1 | sell out (L3) / sold out (L4) → pay through the nose |

## Célzott audit a vak megoldó után (idiómák, szinonimák)

A német PR review-tapasztalata (idióma tükörfordítása; azonos jelentésű kifejezéspár eltérő `hu`-val, amelyet a generátor
egymás mellé tehet) alapján, a PR #431 review-botjainak két jelzésével (`sleet` = havas eső, nem ónos eső; `mumble` /
`mutter` / `murmur` eltérő `hu`) együtt:

- **Idiómák:** az L3 mind a 183 és az L4 mind a 155 `phrase` bejegyzése (338) végigolvasva, az L0–L2 szólásszerű kifejezései a
  korábbi teljes átolvasásból. Átvitt jelentésre / természetes fordításra javítva 6: steal the show („mindenkit lepipál”),
  once in a blue moon („nagyon ritkán”), ahead of schedule („a tervezettnél korábban”), feel under the weather
  („gyengélkedik”), snap out of it („összeszedi magát”), turn out („bizonyul valaminek, kiderül, hogy”). Kicserélve 5
  ismétlődő vagy szinonim kifejezés: it's raining cats and dogs (azonos a „rain cats and dogs”-szal) → every cloud has a
  silver lining; be into (≈ I'm into) → make the most of; pouring with rain (≈ pour with rain) → a heavy shower; win a match
  (≈ win a game) → be knocked out; pay through the nose (≈ cost an arm and a leg) → make ends meet.
- **Közel azonos `hu`:** saját szkript (vesszővel tagolt jelentésrészek zárójel, írásjel és névmás nélkül; azonos `kind`,
  szintkülönbség ≤ 1) 95 párt talált. Azonos jelentésű pároknál a `hu` betűre azonos lett (a generátor így kizárja egymás
  mellől; pl. granny = grandmother „nagymama”, sick = ill „beteg”, scared = afraid „fél, ijedt”, persuade = convince
  „meggyőz”, take care of = look after „vigyáz valakire”, mutter = murmur = mumble „motyog, mormol”), eltérő jelentésűeknél
  pontosítva, hogy ne fedjék egymást (pl. hat „kalap” / cap „sapka”, ticket „jegy (belépő, menet)” / mark „osztályzat”,
  grandson „fiúunoka”). Összesen 86 bejegyzés `hu`-ja változott; a maradó 22 pár homonima vagy eltérő jelentésű (nap / nap (égitest), sarok /
  sarok (lábé), óra stb.), zárójeles megkülönböztetéssel.
- Javítás után: riport 0 hiba, kvóták rendben, írásjel- és közeli duplikátum-kereső tiszta, a két vocab-teszt `# fail 0`.
  Ezt a kört vak megoldó nem ellenőrizte újra (integrátori visszaolvasás).

## Integrátori előkészítés (a vak megoldó előtt)

- 28 duplikált term (K.8.6), 14 írásjel-független és 24 közeli duplikátum feloldva (a magasabb szint cserélve; mintabejegyzés
  nem változott).
- Minőségi szúrópróba szintenként 60 tétel; az L1 (15%) és az L2 (6,7%) 5% fölötti hibaaránya miatt mindkét szint teljes
  átolvasása.
- **`kind`-átsorolás (K.8.5):** 57 szótári főnévi összetétel (pl. rush hour, credit card, climate change, folk music)
  `phrase` → `word` / `noun`; a kiesett kifejezés-kvótát 36 új L3-kifejezés pótolja (pl. take a break, go viral, be based on,
  in danger).

Végállapot: `report --lang en` → total 2664 (L0 554, L1 574, L2 566, L3 560, L4 410), phrase 34,6%, kvóta-hiány nincs,
phrase-kvóta hiány nincs, terv 4.2 minimum teljesül, hibák 0.

## Maradó kockázat

- Anyanyelvi (angol és magyar) lektorálás nem történt (terv 8.).
- A megoldó elvben elérhette volna a repó fájljait; ezt utasítás tiltotta, technikai korlát nem.
- A kérdés mellett álló példafordítás sok jelentéskérdésnél kiolvashatóvá teszi a választ; a „előbb prompt + opciók” szabály
  ezt csak utasítással kezeli.
- Tükörfordításokra és tartalmilag hibás példákra nincs automatikus kereső: csak a megoldók által jelzett tételek és a fenti
  mintákra keresett rendszerszintű hibák javultak; a q1-készlet bejegyzésenként egy kérdéstípust vizsgált.
- A fix-körben módosított 4 bejegyzést és a célzott audit javításait csak integrátori visszaolvasás ellenőrizte, újabb vak
  megoldás nem.
- Az idiómák tükörfordítását és az eltérő `hu`-jú szinonimapárokat a vak megoldó nem fogja meg megbízhatóan (egy kérdésben
  csak a felkínált négy opciót látja); ezekre a célzott audit és a review-botok jelzése volt a védelem.
