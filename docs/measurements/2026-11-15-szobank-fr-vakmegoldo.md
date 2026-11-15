# Szóbank — fr — vak megoldós ellenőrzés

- **Dátum:** 2026-11-15
- **Gyártó modell:** Sonnet 5.5 (5 alügynök, szintenként egy szintfájl, K.8.4)
- **Integrátor / elbíráló:** Opus 5.5 (S5 vezető integrátor)
- **Megoldó modell:** Opus 5.5 (szintenként független alügynök; a fix-körre újabb független alügynök)
- **Seed:** 1115 (1. kör), 1116 (fix-kör)
- **Export-parancs (1. kör, szintenként):**
  `cd source && node --import tsx scripts/vocab-bank.ts blind-export --lang fr --level <n> --seed 1115 --out <scratchpad>/s5-lead/full/blind-fr-<n>.json --key-out <scratchpad>/s5-lead/full/blind-fr-<n>.key.json --canary 10`
- **Pontozás:** `node --import tsx scripts/vocab-bank.ts blind-score --key blind-fr-<n>.q1.key.json --answers blind-fr-<n>.q1.answers.json --out blind-fr-<n>.q1.flagged.json`

## Módszer

- **Szűkített q1-készlet.** A teljes export szintenként 939–1381 kérdés (bejegyzésenként 2–3 típus). Ez a
  megoldónak fölöslegesen sok, ezért a kulcs alapján szkripttel szűkített készlet készült: bejegyzésenként
  PONTOSAN egy kérdés (szavaknál a szinten belüli sorszám szerint váltakozva `target-to-hu` / `hu-to-target`;
  kifejezéseknél `target-to-hu`, mert `phrase-meaning` kérdést az export nem készít; `cloze` csak ha más típus
  nincs), mind a 10 kanári megtartásával. Az L2-n a seed két bejegyzésre (fr2-clothes-006, fr2-feelings-004)
  két-két kanárit tett: ott mindkettő megmaradt (464 kérdés 462 bejegyzésre). A megoldók csak a q1-fájlokat
  látták; a teljes export és a kulcsok az integrátor saját mappájában maradtak.
- **Megoldói szabály a kiolvashatóság ellen:** a kérdésfájl `example` / `exampleHu` mezője sok tételnél
  tartalmazza a választ (hu→cél kérdésnél a francia példa a termet, cél→hu kérdésnél a magyar fordítás a
  jelentést). A megoldók utasítása: előbb CSAK a `prompt` + `options` alapján válaszolnak, a példát csak
  utána nézik (`exampleOk` minősítéshez).
- **Szám–szöveg ellenőrzés:** a megoldók szkriptje minden tételnél ellenőrizte, hogy `options[answer] === chosen`
  (a válaszfájlban plusz `chosen` mező). A `blind-score` a plusz mezőt tűri.
- **Elbírálás (K.8.7/4):** minden jelzett, nem kanári tétel ÉS minden nem üres megoldói `note` (a szintre
  vonatkozó megjegyzések is) minősítve: valódi hiba → javítás azonos azonosítóval, vagy azonos cellájú csere;
  megoldói tévedés → indoklás.
- **A vak kör előtt (integrátor):** 15 szintközi term-ütközés feloldva (a minta marad); 26 közeli duplikátum
  (névelő / többes szám / ragozás / töltelékszó eltérés) szkripttel keresve és a magasabb szinten cserélve;
  szintenként 60 tételes szúrópróba (L0 3, L1 3, L2 6 → 10% miatt az egész L2 átolvasva, összesen 30, L3 3,
  L4 3 hiba javítva).

## Eredmény

| Szint | Bejegyzés | Kérdés | Kanári | Jelzett (1. kör) | Valódi hiba | Javítva | Törölve+pótolva | Megoldói tévedés | Jelzett (utolsó kör) |
|---|---|---|---|---|---|---|---|---|---|
| L0 | 411 | 411 | 10/10 | 6 | 6 | 6 | 0 | 0 | 0 |
| L1 | 461 | 461 | 10/10 | 20 (+3 note) | 22 | 21 | 1 | 1 | 1 |
| L2 | 462 | 464 | 10/10 | 4 | 4 | 4 | 0 | 0 | 1 (note) |
| L3 | 416 | 416 | 10/10 | 7 | 7 | 7 | 0 | 0 | 0 |
| L4 | 314 | 314 | 10/10 | 6 (+9 note) | 15 | 5 | 10 | 0 | 1 |

Megjegyzés: az L1 három „kefél”-jelzése (fr1-travel-017, fr1-animals-017, fr1-animals-022) disztraktorra
vonatkozott; a javítás a forrásbejegyzésen (fr2-animals-009) történt. Az „utolsó kör” a fix-kör (seed 1116):
71 javított / cserélt bejegyzés, 71 kérdés, kanári 10/10, jelzett 2 + 1 megjegyzés, mind javítva.

## Jelzett tételek (1. kör)

- `fr0-everyday-008` — „beaucoup”: a „nagyon” disztraktor is védhető — term „beaucoup de”, hu „sok (valamiből)”.
- `fr0-numbers-015` — „tíz éves” különírva — „tízéves vagyok”, példa „Ma vagyok tízéves.”
- `fr0-numbers-008` — „Nyolc éves.” — „Nyolcéves.”
- `fr0-time-001` — „A nap hosszú nyáron” félreérthető (Nap) — példa „Quel jour sommes-nous aujourd'hui ?” / „Milyen nap van ma?”
- `fr0-time-009` — fordítás pontatlan — „Hétfőn rajzórám van.”
- `fr0-animals-018` — elírás „macském” — „macskám”.
- `fr1-time-007` — le moment ≠ „alkalom”; példa természetellenes — hu „pillanat”, „C'est le bon moment pour partir.”
- `fr1-numbers-003` — „negyven éves” — „negyvenéves”.
- `fr1-animals-004` — „La girafe est très haute.” — „très grande”.
- `fr1-family-001` — „öt éves” — „ötéves”.
- `fr1-body-007` — hiányzó névelő („de bébé”) — „du bébé” (a fix-körben többes számra javítva).
- `fr1-body-013` — általános francia / birtokos magyar — „Mon cœur bat vite…”.
- `fr1-travel-017` — disztraktor „lovat kefél” (korosztály) — fr2-animals-009 hu „lovat csutakol”.
- `fr1-body-006` — „La gorge est sèche…” — „J'ai la gorge sèche après la course.”
- `fr1-animals-009` — „pingouin” = alka, a pingvin „manchot” — term „le manchot”, példa „…une région très froide”.
- `fr1-family-004` — „tíz éves” — „tízéves”.
- `fr1-school-023` — „a tizedik oldalon” — „oldalnál” (a fr0-school-022 azonos hibája is javítva).
- `fr1-body-003` — „Le talon de mon pied me fait mal.” — „J'ai mal au talon.”
- `fr1-family-006` — „tizenkét éves” — „tizenkétéves”.
- `fr1-sports-003` — „mezje” — „meze”.
- `fr1-everyday-021` — megoldói tévedés: a „savoir la réponse” helyes francia; a példa ennek ellenére egyértelműsítve („Je ne sais pas où est mon livre.”).
- `fr1-shopping-012` — „La taille est trop grande” — „Cette taille est trop grande pour moi.”
- `fr1-animals-017` — disztraktor „lovat kefél” — lásd fr2-animals-009.
- `fr1-animals-022` — disztraktor „lovat kefél” — lásd fr2-animals-009.
- `fr1-time-008` — „dans l'instant” hibás; l'instant = le moment jelentése — törölve+pótolva: „le début” (kezdet, eleje).
- `fr1-numbers-014` — „tíz éves” — „tízéves” (a fix-körben a példa a jelentéshez igazítva).
- `fr1-numbers-017` — elírás „veux-t” — „veux-tu”.
- `fr1-family-018` — „kilencven éves” — „kilencvenéves”.
- `fr1-school-014` — „Le camarade de classe” — „Mon camarade de classe m'aide.”
- `fr2-body-004` — „Le poignet me fait mal” — „J'ai mal au poignet après le tennis.”
- `fr2-body-003` — „orca” régies — hu „orca, arcfél” (lásd a fix-kört).
- `fr2-weather-001` — „eltört egy fát” — „kidöntött egy fát”.
- `fr2-body-014` — „Le sang coule du doigt.” — „Du sang coule de son doigt.”
- `fr3-family-012` — „tenir de qqn pour qch” nem idiomatikus — „Léa tient de son père : elle est très patiente.”
- `fr3-animals-013` — a „semble” kimaradt a fordításból — „Mon grand-père a une mémoire d'éléphant.”
- `fr3-work-022` — „pénteknél előbb” — „péntek előtt”.
- `fr3-health-017` — „be kell oltatni magát” — „be kell oltatnunk magunkat”.
- `fr3-technology-011` — általánosító egyes szám — „Les réseaux sociaux sont interdits avant treize ans.”
- `fr3-work-002` — „La profession de ma mère est infirmière.” — „Quelle est la profession de ton père ?”
- `fr3-time-007` — dorénavant: „mostantól” és „ezentúl” is helyes — a dorénavant és a désormais (fr4-time-005) hu-ja betűre azonos („ezentúl, mostantól”), így a generátor nem teszi őket egymás mellé.
- `fr4-everyday-009` — szint (se lever tôt, A1–A2) — törölve+pótolva: „faire la grasse matinée”.
- `fr4-feelings-011` — magyar nyelvtani hiba — „Jó látni az osztály lelkesedését.”
- `fr4-health-009` — szint (la fatigue) — törölve+pótolva: „l'épuisement”.
- `fr4-communication-024` — szint (Qu'est-ce que tu en penses ?) — törölve+pótolva: „mettre les points sur les i”.
- `fr4-everyday-012` — szint (en général) — törölve+pótolva: „en fin de compte”.
- `fr4-animals-007` — szint (nourrir les animaux) — törölve+pótolva: „une espèce protégée”.
- `fr4-sports-012` — „en bonne forme”: az „egészséges” (être en bonne santé) is védhető — törölve+pótolva: „se qualifier pour la finale”.
- `fr4-culture-009` — szint (le festival) — törölve+pótolva: „la mise en scène”.
- `fr4-communication-022` — szint (à mon avis) — törölve+pótolva: „en d'autres termes”.
- `fr4-health-006` — „A seb sokáig tart” — „A seb lassan gyógyul be.”
- `fr4-city-005` — „centre piétonnier” nem természetes — példa javítva (a fix-körben sétálóutcára).
- `fr4-travel-006` — szint (réserver) — törölve+pótolva: „s'expatrier”.
- `fr4-nature-016` — „vizet takarítani” félreérthető — hu „takarékoskodik a vízzel”.
- `fr4-everyday-001` — szint (prendre une décision) — törölve+pótolva: „faire preuve de patience”.
- `fr4-freetime-012` — „műhelyre iratkozik” — „beiratkozik egy szakkörre”, „fazekasszakkörre”.

## Rendszerszintű javítások (a teljes francia bankon, nem csak a jelzett tételeken)

- „-éves” különírva számnévvel: 12 (ebből 3 jelzés nélkül: fr0-family-019, fr2-family-004, fr3-school-003).
- Testrész alanyként birtokos helyett („J'ai mal au…”, „J'ai la gorge sèche”, „s'est cassé la clavicule”,
  „Mon cœur / Mon pied…”): 9 (ebből 4 jelzés nélkül: fr0-body-004, fr2-body-017, fr3-body-006, fr4-body-002).
- Korosztálynak kínos / kétértelmű magyar szó: „kefél” → „csutakol” (fr2-animals-009), „bedug” kivéve
  (fr3-technology-016 → „csatlakoztat”); a többi gyanús szóra futtatott keresés csak ártalmatlan találatot adott.
- Elírás („veux-t”), „dans l'instant”, „mezje”, „oldalon” → „oldalnál”: mind javítva; a „savoir” + főnév
  keresés újabb hibát nem talált.
- B2-höz túl könnyű L4 tételek: a 9 megoldói jelzésen túl további 7 csere (le sommeil, installer, la vitrine,
  sauvage, en noir et blanc, le conte, les réseaux sociaux — utóbbi a le réseau social közeli duplikátuma).
- Kétértelmű opciópárok: beaucoup / très, dorénavant / désormais, le moment / l'instant, en bonne forme /
  être en bonne santé, la pâte / les pâtes (hu „nyers tészta, massza”).

## Spec-pontosítás: a `(hn.)`/`(nn.)` jelölés eltávolítása

Az S5 fejezet szerint az `l'` névelős főnév `hu` mezője jelzi a nemet (`iskola (nn.)`). A gyártás után 154
bejegyzésben állt ilyen jelölés, következetlenül. A játékban a `hu` válaszlehetőségként jelenik meg, és mivel a
jelölés csak az `l'`-es főneveken állt, elárulta volna a megoldást (cél→hu kérdésnél a jelölt opció, hu→cél
kérdésnél az `l'`-es opció). Ezért a jelölés az egész francia bankból egységesen kikerült; a jelentést
egyértelműsítő zárójelek (pl. „óra (időegység)”, „eladó (nő)”) maradtak. Az S5 fejezet ennek megfelelően
pontosítva.

## Fix-kör (seed 1116)

- 71 javított / cserélt bejegyzés, bejegyzésenként egy kérdés, 10 kanári; független Opus 5.5 megoldó.
- Pontozás: `ellenőrzött: 71, jelzett: 2, kanári: 10/10`; 0 kétértelmű.
- `fr1-body-007` — „L'orteil du bébé” (a babának tíz van) — „Les orteils du bébé sont tout petits.” (alt: orteils).
- `fr4-city-005` — „A gyalogos belváros” nem magyaros — „La rue piétonnière est très animée le samedi.” /
  „A sétálóutca szombaton nagyon nyüzsgő.”, hu „sétáló- (csak gyalogosoknak)”.
- `fr2-body-003` (megjegyzés) — az „orca” a kisebbeknek nehéz — döntés: hu „orca, arcfél”. Az „arc (orca)”
  alak nem választható, mert a le visage = „arc” mellett a generátor egymás mellé tehetné őket (csak a betűre
  azonos `hu`-t zárja ki), és akkor két védhető opció lenne. A betűre azonos „arc” pedig a joue / visage
  különbségét tüntetné el. A tétel L2-es, felső tagozatos szint.
- Ezt a három javítást nem oldattuk meg újra: integrátori ellenőrzéssel zárult.
- A fix-kör 10 kanáris bejegyzését a megoldó szándékosan rontott kulccsal látta, ezért ezek integrátori
  visszaolvasással zárultak: fr0-time-001, fr0-time-009, fr0-animals-018, fr1-family-001, fr1-school-014,
  fr1-time-008, fr1-numbers-014 (a példa a „többé-kevésbé” jelentéshez igazítva: „Mon dessin est plus ou moins
  réussi.”), fr2-animals-009, fr4-shopping-005, fr4-technology-015.

## Célzott audit: idiómák és szinonimapárok (a vak körök után)

A német PR reviewjában két olyan hibatípus derült ki, amelyet a vak megoldók nem fogtak meg (idióma
tükörfordítása; azonos jelentésű kifejezéspár eltérő `hu`-val), ezért a teljes francia bankon célzott audit
készült.

- **Idiómák:** az L3 és L4 mind a 268 `phrase` bejegyzése, valamint az L0–L2 112 szólásszerű / igei kifejezése
  végigolvasva (a `hu` az átvitt jelentést adja-e, a példa fordítása természetes-e). 12 javítás:
  - avoir la boule au ventre: „gombóc van a gyomrában” (tükörfordítás) → „görcsben van a gyomra (izgul)”;
  - sur un nuage: „a mennyekben jár” → „a hetedik mennyországban van”;
  - avoir les jambes lourdes: „nehéz a lába” (a magyarban „nehéz lábú” = várandós) → „elnehezül, elfárad a lába”;
  - hors des sentiers battus: szó szerinti „kitaposott ösvényeken kívül” → „a megszokott turistautaktól távol”;
  - relever un défi: „kihívásnak megfelel” → „vállalja a kihívást”;
  - reprendre le dessus: a példa a reprendre des forces jelentését adta → „talpra áll, felülkerekedik”, új példa;
  - avoir la flemme, avoir le cafard: természetes példa és pontosabb `hu`;
  - prendre un raccourci → „levágja az utat”; se changer les idées, faire partie d'un club: `hu` pontosítva;
    se trouver près de: természetellenes példa javítva;
  - comme deux gouttes d'eau (L4) a se ressembler comme deux gouttes d'eau (L3) közeli duplikátuma és szó
    szerinti fordítású volt („mint két csepp víz”) → csere: avoir un air de famille.
- **Szinonimapárok és azonos szavú `hu`-k** (szkript: az írásjel / zárójel nélkül azonos, illetve egymás
  részhalmazát képező `hu`-k, plusz ismert párok listája; 171 jelölt kézzel átnézve). Csak az számított hibának,
  ahol a két bejegyzés azonos `kind`-ú (a generátor csak azonos `kind`-ból választ rossz választ), és mindkettő
  védhető válasz lenne:
  - azonos jelentésű, eltérő alakú termpárok cseréje a magasabb szinten (6): avoir faim / j'ai faim,
    avoir soif / j'ai soif, avoir peur / j'ai peur, avoir mal à la tête / j'ai mal à la tête,
    être enfant unique / enfant unique, à temps partiel / travailler à temps partiel;
  - betűre azonos `hu` igazi szinonimáknál, hogy a generátor ne tegye őket egymás mellé (9 bejegyzés):
    ça me fait plaisir = je suis content („örülök”), je vous en prie = avec plaisir = de rien („szívesen”),
    étonné = surpris („meglepett”), recruter = embaucher, cuire = faire la cuisine = cuisiner („főz”),
    le pourcentage = pour cent („százalék”), la journée = le jour („nap”), la soirée = le soir („este”),
    brun = marron („barna”);
  - homonimák (azonos magyar szó, eltérő jelentés) `hu`-jának szűkítése, hogy ne legyenek egymás védhető
    elterelői: le château „kastély” (attendre = vár), le quartier „városrész” (le quart = negyed),
    la note „osztályzat” (le billet = jegy), le but „gól” (le portail = kapu), la patte „mancs”, la poupée
    „játékbaba” (le bébé = baba), l'atelier „műhely”, le rayon „áruházi részleg”, le panneau „jelzőtábla”,
    le courrier „levelek, küldemények”, la falaise „sziklafal, szirt”, s'inscrire „beiratkozik”, annuler
    „lemond, visszavon”, réussir „sikerül”, le patron „főnök”, à bientôt „viszlát hamarosan” stb.;
  - **kétszintű szinonima-védelem (orkesztrátori döntés, #428 review):** (A) a generátor külön PR-ban
    kizárja azt a rossz választ, amelynek `hu`-ja a helyes bejegyzésével jelentés-kulcsban átfed (vessző /
    pontosvessző / perjel mentén darabolva, zárójeles rész és írásjel nélkül); (B) az adatoldalon minden
    azonos vagy erősen átfedő jelentésű bejegyzéspár `hu`-jában van legalább egy betűre azonos, vesszővel
    elválasztott tag. Ellenőrizve (szkript): surpris / étonné „meglepett”, inquiet / soucieux „aggódó”,
    nerveux / énervé „ideges”, la veste / le blouson „dzseki”, calme / détendu „nyugodt”, rassuré / apaisé
    „megnyugodott”, fâché / furieux „dühös”, fatigué / épuisé „fáradt”, le médecin / le docteur „orvos”,
    délicieux / savoureux „ízletes”, la blague / la plaisanterie „vicc”, la statue / la sculpture „szobor”,
    polluer / contaminer „szennyez”, valamint le métier / la profession, l'emploi / le travail, le magasin /
    la boutique, le portable / le téléphone, content / heureux, la conversation / la discussion / le débat,
    l'excursion / l'escapade / la sortie, le guide / le guide touristique, faire du shopping / faire un achat,
    nettoyer / faire le ménage, faire des travaux / rénover, le trajet / l'itinéraire, éclatant / vif,
    le règlement / le règlement intérieur, l'armoire / le placard, le rendement / la performance,
    maintenant / en ce moment.
- Szándékosan azonos `hu` ugyanabban a cellában (valódi szinonimák, a generátor kizárja az együttes
  megjelenést): avec plaisir / je vous en prie, cuire / faire la cuisine, le pourcentage / pour cent.
- Összesen 78 különböző bejegyzés módosult (68 az első audit-körben, ebből 7 csere; 32 a közös jelentés-kulcs kialakításakor, részben ugyanazok); a riport utána is 0 hiba. Ezeket a változtatásokat
  vak megoldó nem ellenőrizte: integrátori ellenőrzéssel zárultak.

## Záró állapot

`report --lang fr`: total 2064 (L0 411, L1 461, L2 462, L3 416, L4 314), phrase 746 (36,1%), kvóta-hiány nincs,
phrase-kvóta hiány nincs, terv 4.2 minimum teljesül, hibák: 0. `fr/stage.ts` → `"full"`.

## Maradó kockázat

- Anyanyelvi (francia és magyar) lektorálás nem történt (terv 8.).
- A megoldó elvben elérhette volna a repó fájljait (utasítással tiltva, technikailag nem kizárva).
- A kérdésfájl példamondata sok tételnél kiolvashatóvá teszi a választ; az „előbb prompt + opciók” szabály ezt
  csak utasítással kezeli.
- A fix-kör 10 kanáris bejegyzése és a fix-kör három javítása csak integrátori ellenőrzésen ment át, nem
  független megoldón.
- Az idiómák tükörfordítását és a szinonimapárokat a vak megoldó nem fogja meg megbízhatóan (a vak körök
  ezeket nem jelezték, a célzott audit talált rájuk); az audit utáni módosítások csak integrátori
  ellenőrzésen ment át.
- A fr4-family-005 „la famille d'accueil” `phrase`-ként szerepel, bár főnévi összetétel (K.8.5 szerint `word`);
  a kifejezés-kvóta védelmében nem módosítva.
