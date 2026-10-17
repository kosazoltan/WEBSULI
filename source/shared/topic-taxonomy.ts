import type { CatalogSubject } from "./catalog-taxonomy";
import { designThemeForClassroom } from "./lesson-design";
import { subjectKeyOf } from "./subject-key";
import { SUBJECT_BANDS, type DesignBand } from "./subject-icons";

/**
 * Websuli arculati bank (docs/specs/2026-10-17-arculati-bank.md): tantárgy × évfolyamsáv témakörök a témaköri borítókhoz.
 * A NAT 2020 kerettantervi témakörei alapján ÖSSZEFOGLALVA (nem a NAT szó szerinti szövege; a tulajdonos szúrópróbázza).
 * A `keywords` ékezettűrő összevetéshez (`foldText`), a `motif` a borító angol képleírása (szöveg nélkül).
 */
export type Topic = { subject: CatalogSubject; band: DesignBand; key: string; label: string; keywords: string[]; motif: string };
type Row = [key: string, label: string, keywords: string, motif: string];

const T: Partial<Record<CatalogSubject, Partial<Record<DesignBand, Row[]>>>> = {
  matematika: {
    explorer: [
      ["szamok-20", "Számok 20-ig", "szamok szamolas szamkor szomszed sorrend", "colorful counting beads and number blocks arranged in a gentle row"],
      ["osszeadas-kivonas", "Összeadás és kivonás", "osszeadas kivonas potlas bontas", "two baskets of apples being combined on a picnic blanket"],
      ["formak", "Síkidomok és formák", "forma alakzat haromszog kor negyzet teglalap sikidom", "big friendly geometric toy shapes on a meadow"],
      ["meres", "Mérés és összehasonlítás", "meres hosszabb rovidebb nehezebb merleg", "a toy balance scale with fruits on a wooden table"],
    ],
    adventure: [
      ["szamkor-1000", "Számok ezres körben", "ezres szazas helyiertek kerekites szamegyenes", "an adventure path made of numbered stepping stones up a hill"],
      ["szorzas-osztas", "Szorzás és osztás", "szorzas osztas szorzotabla maradek", "neat rows of seedlings planted in a garden grid"],
      ["tortek", "Törtek", "tort tortek nevezo szamlalo resz egesz", "a round pizza and a chocolate bar divided into equal pieces"],
      ["geometria", "Geometria és kerület", "kerulet terulet szog test kocka teglatest geometria", "wooden building blocks forming cubes and prisms on a desk"],
      ["mertekegysegek", "Mértékegységek", "mertekegyseg meter liter kilogramm ido ora atvaltas", "a ruler, a measuring jug and a clock on a workbench"],
      ["szoveges-feladatok", "Szöveges feladatok", "szoveges feladat problemamegoldas logika", "a treasure map with footprints leading to a chest"],
    ],
    studio: [
      ["racionalis-szamok", "Racionális számok", "egesz negativ racionalis tizedes szamegyenes", "a number line bridge stretching across a calm valley"],
      ["egyenletek", "Egyenletek és algebra", "egyenlet algebra kifejezes ismeretlen", "a perfectly balanced scale with weights and cubes"],
      ["aranyossag", "Arányosság és százalék", "arany aranyossag szazalek kamat", "a pie chart garden with flower beds of different sizes"],
      ["sikgeometria", "Síkgeometria", "haromszog sokszog szog szerkesztes pitagorasz terulet", "a compass and ruler drawing elegant triangles on paper"],
      ["statisztika", "Statisztika és valószínűség", "statisztika diagram atlag valoszinuseg", "colorful bar chart blocks and dice on a desk"],
    ],
    laboratory: [
      ["fuggvenyek", "Függvények", "fuggveny grafikon linearis masodfoku", "smooth glowing function curves over a grid landscape"],
      ["masodfoku", "Másodfokú egyenletek", "masodfoku egyenlet diszkriminans parabola", "a fountain jet forming a perfect parabola"],
      ["geometria-bizonyitas", "Geometria és bizonyítás", "bizonyitas hasonlosag kor szog terulet", "a compass drawing a circle inscribed in a triangle with tangent lines on clean white paper, a precise geometric construction"],
      ["kombinatorika", "Kombinatorika és valószínűség", "kombinatorika valoszinuseg permutacio", "a tree diagram of branching paths made of light"],
    ],
    future: [
      ["sorozatok", "Sorozatok", "sorozat szamtani mertani", "a spiral staircase of growing steps"],
      ["exponencialis-logaritmus", "Exponenciális és logaritmus", "exponencialis logaritmus hatvany", "a steep rising curve over a city skyline at dawn"],
      ["trigonometria", "Trigonometria", "trigonometria szinusz koszinusz szog", "a lighthouse beam sweeping a unit circle over the sea"],
      ["koordinatageometria", "Koordinátageometria és vektorok", "koordinata vektor egyenes kor egyenlete", "glowing vectors on a 3D coordinate grid"],
      ["erettsegi", "Érettségi felkészülés", "erettsegi felkeszules ismetles feladatsor", "an organised study desk with neat notes and a calculator at dawn"],
    ],
  },
  "magyar-nyelvtan": {
    explorer: [
      ["betuk-hangok", "Betűk és hangok", "betu hang abc olvasas iras", "colorful toy blocks and a friendly open notebook with wavy lines"],
      ["szavak", "Szavak és mondatok", "szo mondat szotag", "a little train whose wagons carry blank word cards"],
      ["helyesiras-alap", "Helyesírás alapjai", "helyesiras hosszu rovid", "a pencil and eraser tidying a page of practice lines"],
    ],
    adventure: [
      ["szofajok", "Szófajok", "szofaj fonev ige melleknev szamnev nevmas", "a sorting cabinet with colored drawers and blank cards"],
      ["helyesiras", "Helyesírás", "helyesiras egybeiras kulonirasa", "a magnifying glass over a neatly written blank page"],
      ["mondatfajtak", "Mondatfajták", "mondatfajta kijelento kerdo felkialto", "speech bubbles of different shapes floating above a playground"],
      ["szoalkotas", "Szóalkotás és toldalékok", "toldalek kepzo jel rag szoto osszetett", "building bricks snapping together into longer chains"],
    ],
    studio: [
      ["mondatreszek", "Mondatrészek", "mondatresz alany allitmany targy hatarozo jelzo", "a mobile sculpture of connected shapes in balance"],
      ["szoszerkezetek", "Szószerkezetek", "szoszerkezet alarendelo melleerendelo", "puzzle pieces fitting into a larger structure"],
      ["osszetett-mondat", "Összetett mondat", "osszetett mondat kotoszo tagmondat", "two bridges joining into one road"],
      ["kommunikacio", "Kommunikáció", "kommunikacio uzenet csatorna szovegertes", "a paper airplane carrying a message between two windows"],
    ],
    laboratory: [
      ["szoveg-tan", "Szövegtan", "szoveg szovegtan koherencia bekezdes", "a well-organised bookshelf with labelled blank spines"],
      ["stilisztika", "Stílus és retorika", "stilus stilisztika retorika erveles", "a speaker's podium in an empty elegant hall"],
      ["nyelvvaltozatok", "Nyelvváltozatok", "nyelvvaltozat tajnyelv szleng regiszter", "a map with many small houses and speech bubbles"],
    ],
    future: [
      ["nyelvtortenet", "Nyelvtörténet", "nyelvtortenet nyelvemlek nyelvcsalad", "an ancient parchment beside a modern tablet"],
      ["erveles", "Érvelés és vita", "erveles vita erv cafolat", "two balanced scales on a debate stage"],
      ["erettsegi-nyelv", "Érettségi felkészülés", "erettsegi felkeszules szovegalkotas", "a fountain pen over a structured blank essay page"],
    ],
  },
  "magyar-irodalom": {
    explorer: [
      ["mesek", "Mesék", "mese mesek kiralylany sarkany", "an open storybook with a tiny castle and a friendly dragon"],
      ["versek-mondokak", "Versek és mondókák", "vers mondoka rim ritmus", "musical notes and leaves dancing above an open book"],
      ["allatos-tortenetek", "Állatos történetek", "allat allatok tortenet", "forest animals gathered around an open picture book"],
    ],
    adventure: [
      ["nepmesek", "Népmesék és mondák", "nepmese monda legenda", "a folk-art painted chest with a story scroll"],
      ["regenyek", "Gyerekregények", "regeny regenyek fiuk kalandregeny", "a stack of adventure books with a compass"],
      ["versek", "Versek", "vers kolto koltemeny strofa", "a feather quill writing on a page under a moonlit window"],
      ["mitologia", "Mitológia", "mitologia gorog istenek hos", "a classical temple on a hill with a laurel wreath"],
    ],
    studio: [
      ["epika", "Epika és novella", "epika novella elbeszeles", "a winding road leading into a storybook landscape"],
      ["lira", "Líra", "lira vers kolto kepiseg", "a lone tree with falling leaves at sunset"],
      ["drama", "Dráma", "drama szinhaz jelenet", "a theatre stage with red curtains and a spotlight"],
      ["nemzeti-irodalom", "Nemzeti irodalom", "petofi arany toldi janos vitez", "a hussar's hat and a quill beside an old book"],
    ],
    laboratory: [
      ["antikvitas-kozepkor", "Antikvitás és középkor", "antik kozepkor biblia homerosz", "a classical column and a medieval codex"],
      ["reneszansz-barokk", "Reneszánsz és barokk", "reneszansz barokk balassi zrinyi", "an ornate renaissance window with a lute"],
      ["felvilagosodas-romantika", "Felvilágosodás és romantika", "felvilagosodas romantika vorosmarty", "a candle-lit study with an open letter"],
    ],
    future: [
      ["realizmus", "Realizmus", "realizmus mikszath jokai", "a 19th century village street in soft light"],
      ["nyugat", "A Nyugat költői", "nyugat ady babits kosztolanyi", "an elegant early 20th century café table with a journal"],
      ["xx-szazad", "XX. századi irodalom", "jozsef attila radnoti ortkeny", "a train window looking out on a changing landscape"],
      ["kortars", "Kortárs irodalom", "kortars mai irodalom", "a modern reading nook with a lamp and books"],
    ],
  },
  kornyezetismeret: {
    explorer: [
      ["evszakok", "Évszakok és időjárás", "evszak idojaras tel tavasz nyar osz", "one tree shown in four seasons side by side"],
      ["allatok-novenyek", "Állatok és növények", "allat noveny haziallat virag", "a farmyard with friendly animals and flowers"],
      ["testunk", "Testünk és egészségünk", "test egeszseg tisztalkodas taplalkozas", "healthy fruit, a toothbrush and a smiling sun"],
      ["kozlekedes", "Közlekedés", "kozlekedes jarmu zebra lampa", "a toy town crossroad with a zebra crossing"],
    ],
    adventure: [
      ["viz", "A víz", "viz korforgas halmazallapot csapadek", "a river, clouds and rain in a gentle water cycle"],
      ["eletkozossegek", "Életközösségek", "erdo mezo eletkozosseg", "a cross-section of a forest with animals and plants"],
      ["emberi-test", "Az emberi test", "emberi test szervek csontvaz izom", "a friendly anatomy model with simple organs"],
      ["tajekozodas", "Tájékozódás és térkép", "terkep iranyok tajekozodas iranytu", "a compass on a colorful map of hills and rivers"],
      ["anyagok", "Anyagok és tulajdonságaik", "anyag tulajdonsag kemeny lagy oldodas", "jars of sand, water and stones on a shelf"],
    ],
  },
  termeszetismeret: {
    adventure: [
      ["novenyek", "Növények", "noveny gyoker szar level virag termes", "a sprouting seed growing into a flowering plant"],
      ["allatok", "Állatok", "allat gerinces rovar emlos madar", "a meadow with birds, insects and a hedgehog"],
      ["kert-gyumolcsos", "Kert és gyümölcsös", "kert gyumolcsos szolo zoldseg", "a sunny orchard with apple trees and grapevines"],
      ["anyag-energia", "Anyag és energia", "anyag energia halmazallapot", "a kettle steaming and ice cubes melting side by side"],
      ["fold-urben", "A Föld és a Naprendszer", "fold nap hold bolygo naprendszer", "the Sun and planets in a gentle orbit"],
    ],
    studio: [
      ["termeszettudomanyos-vizsgalat", "Természettudományos vizsgálat", "kiserlet megfigyeles vizsgalat meres", "a microscope, a flask and a notebook on a lab bench"],
      ["eloviltag", "Az élővilág", "eloviltag sejt eloleny okoszisztema", "a lush ecosystem with a leaf in close-up"],
      ["anyagok-studio", "Anyagok és változások", "anyag keverek oldat valtozas", "colorful liquids mixing in glass beakers"],
      ["fold-studio", "A Föld bolygó", "fold kozet legkor vizburok", "a cut-away globe showing layers of the Earth"],
    ],
  },
  tortenelem: {
    adventure: [
      ["oskor", "Őskor", "oskor ember barlang vadasz", "a prehistoric cave entrance with simple tools"],
      ["okor", "Az ókor", "okor egyiptom gorog romai piramis", "pyramids and a Greek temple on a sunny horizon"],
      ["magyar-ostortenet", "Magyar őstörténet", "honfoglalas ostortenet magyar torzsek arpad", "horse riders crossing a wide grassland"],
      ["kozepkor-adv", "A középkor", "kozepkor lovag var kiraly", "a medieval castle with flags on a hill"],
      ["csaladom-lakohelyem", "Családom és lakóhelyem", "csalad lakohely helytortenet", "a cosy village street with old houses"],
    ],
    studio: [
      ["okor-studio", "Ókori civilizációk", "okori gorog romai athen roma", "a Roman aqueduct and a Greek amphitheatre"],
      ["kozepkor-studio", "Középkor és Árpád-kor", "kozepkor arpad szent istvan kereszteny", "a medieval crown and a parchment charter"],
      ["ujkor", "Újkor és felfedezések", "felfedezes ujkor reformacio torok", "a sailing ship on a vast ocean with a map"],
      ["forradalmak", "Forradalmak", "forradalom 1848 szabadsagharc", "a cockade and a flag blowing in the wind"],
      ["vilaghaboruk", "A világháborúk kora", "vilaghaboru haboru trianon", "a quiet memorial with poppies"],
    ],
    laboratory: [
      ["xix-szazad", "A XIX. század", "ipari forradalom dualizmus reformkor", "a steam locomotive crossing an iron bridge"],
      ["xx-szazad-elso-fele", "A XX. század első fele", "vilaghaboru diktatura totalitarizmus", "an old radio and newspapers on a table"],
      ["hideghaboru", "Hidegháború és 1956", "hideghaboru 1956 forradalom", "a broken wall with a candle"],
    ],
    future: [
      ["rendszervaltas", "Rendszerváltás", "rendszervaltas demokracia 1989", "a ballot box in a sunny public square"],
      ["europa-integracio", "Európai integráció", "europai unio integracio", "a circle of stars over a modern city"],
      ["globalis-vilag", "A globális világ", "globalizacio digitalis vilag", "a glowing globe connected by light trails"],
      ["erettsegi-tortenelem", "Érettségi felkészülés", "erettsegi felkeszules forraselemzes", "an archive desk with old maps and a magnifier"],
    ],
  },
  "tarsadalmi-ismeretek": {
    studio: [
      ["kozosseg", "Közösség és szabályok", "kozosseg szabaly egyuttmukodes", "people around a round table building a puzzle together"],
      ["jogok", "Jogok és kötelességek", "jog kotelesseg gyermekjog", "a balance scale beside an open rulebook"],
      ["penzugyek", "Pénzügyi alapok", "penz zsebpenz megtakaritas", "a piggy bank and coins on a desk"],
    ],
    laboratory: [
      ["allam", "Az állam működése", "allam alkotmany parlament", "a parliament dome under a clear sky"],
      ["gazdasag", "Gazdaság", "gazdasag piac kereslet kinalat", "a busy market stall with balanced scales"],
      ["media", "Média és információ", "media hir informacio alhir", "a smartphone with floating news cards"],
    ],
    future: [
      ["allampolgarsag", "Állampolgárság", "allampolgar valasztas demokracia", "a ballot box and a voter card"],
      ["munka-vilaga", "A munka világa", "munka palyavalasztas karrier", "a crossroads signpost pointing to different careers"],
      ["fenntarthatosag-tarsadalom", "Fenntarthatóság és társadalom", "fenntarthatosag felelosseg kornyezet", "a city with green rooftops and solar panels"],
    ],
  },
  biologia: {
    studio: [
      ["sejt", "A sejt", "sejt sejtmag sejtfal", "a stylised plant cell with organelles"],
      ["noveny-allatvilag", "Növény- és állatvilág", "noveny allat rendszertan", "a forest with diverse plants and animals"],
      ["emberi-test-bio", "Az emberi test", "ember test szerv keringes legzes", "a stylised human silhouette with organ systems"],
      ["okologia", "Ökológia", "okologia taplaleklanc eletkozosseg", "a food chain from leaf to fox in a meadow"],
    ],
    laboratory: [
      ["oroklodes", "Öröklődés és genetika", "oroklodes gen dns genetika", "a glowing DNA double helix"],
      ["evolucio", "Evolúció", "evolucio alkalmazkodas fajok", "a branching tree of life with animals"],
      ["elettan", "Élettan", "elettan idegrendszer hormon", "a stylised neuron network glowing softly"],
    ],
    future: [
      ["molekularis", "Molekuláris biológia", "feherje enzim molekula", "a protein molecule model in soft light"],
      ["immunrendszer", "Immunrendszer és egészség", "immun betegseg egeszseg", "a shield-like cell defending against small particles"],
      ["erettsegi-bio", "Érettségi felkészülés", "erettsegi felkeszules", "a microscope beside neat study notes"],
    ],
  },
  kemia: {
    studio: [
      ["anyagok-kemia", "Anyagok és keverékek", "anyag keverek oldat szetvalasztas", "beakers with layered colorful liquids"],
      ["atomok", "Atomok és molekulák", "atom molekula elem periodusos", "ball-and-stick molecule models on a lab bench"],
      ["reakciok", "Kémiai reakciók", "reakcio egyenlet egeses", "a flask bubbling gently with a soft glow"],
    ],
    laboratory: [
      ["periodusos-rendszer", "Periódusos rendszer", "periodusos rendszer elem", "a grid of glowing glass element tiles without letters"],
      ["kotesek", "Kémiai kötések", "kotes ionos kovalens", "two atoms sharing a glowing bond"],
      ["sav-bazis", "Savak és bázisok", "sav bazis indikator", "test tubes in a gradient of indicator colors"],
    ],
    future: [
      ["szerves-kemia", "Szerves kémia", "szerves szenhidrogen", "a hexagonal benzene-like ring model"],
      ["elektrokemia", "Elektrokémia", "elektrokemia elem elektrolizis", "a lemon battery lighting a small bulb"],
      ["erettsegi-kemia", "Érettségi felkészülés", "erettsegi felkeszules", "a lab notebook beside glassware"],
    ],
  },
  fizika: {
    studio: [
      ["mozgas", "Mozgás és erő", "mozgas sebesseg ero gyorsulas", "a toy car rolling down a ramp"],
      ["energia", "Energia", "energia munka teljesitmeny", "a windmill and a solar panel in a field"],
      ["elektromossag", "Elektromosság", "elektromossag aram aramkor feszultseg", "a simple circuit with a battery and a glowing bulb"],
      ["hotan", "Hőtan", "homerseklet hotagulas", "a thermometer beside a steaming mug"],
    ],
    laboratory: [
      ["mechanika", "Mechanika", "mechanika newton lendulet", "a Newton's cradle in motion"],
      ["hullamok", "Rezgések és hullámok", "rezges hullam hang", "concentric ripples spreading on water"],
      ["optika", "Optika", "optika feny lencse tukor", "a prism splitting light into a rainbow"],
    ],
    future: [
      ["elektromagnesseg", "Elektromágnesség", "magnes elektromagneses indukcio", "a coil and magnet with glowing field lines"],
      ["modern-fizika", "Modern fizika", "atom kvantum relativitas", "an atom with elliptical orbits and soft glow"],
      ["csillagaszat", "Csillagászat", "csillag galaxis univerzum", "a spiral galaxy above a telescope"],
    ],
  },
  foldrajz: {
    studio: [
      ["terkep", "Térkép és tájékozódás", "terkep leptek fokhalozat tajekozodas", "a globe on a stand with a map pin"],
      ["foldfelszin", "A földfelszín", "hegy volgy folyo felszin", "mountains and a river valley in cross-section"],
      ["eghajlat", "Időjárás és éghajlat", "eghajlat idojaras ovezet", "climate zones from desert to snowy peaks"],
      ["magyarorszag", "Magyarország földrajza", "magyarorszag alfold balaton duna", "a gentle landscape with a lake and rolling hills"],
    ],
    laboratory: [
      ["kontinensek", "Kontinensek", "kontinens europa azsia afrika amerika", "a world map of continents in soft colors"],
      ["nepesseg", "Népesség és települések", "nepesseg varos falu", "a city and a village connected by a road"],
      ["gazdasagfoldrajz", "Gazdaságföldrajz", "gazdasag ipar mezogazdasag", "fields, factories and a harbour on a map tile"],
    ],
    future: [
      ["globalis-problemak", "Globális problémák", "globalis klimavaltozas fenntarthatosag", "a melting glacier beside a green forest"],
      ["vilaggazdasag", "Világgazdaság", "vilaggazdasag kereskedelem", "cargo ships and trade routes on a globe"],
      ["erettsegi-foldrajz", "Érettségi felkészülés", "erettsegi felkeszules", "an atlas and a compass on a desk"],
    ],
  },
  angol: {
    explorer: [
      ["koszones", "Köszönés és bemutatkozás", "hello koszones bemutatkozas", "two friendly speech bubbles and a waving hand"],
      ["szinek-szamok", "Színek és számok", "szinek colours numbers szamok", "colorful paint pots and number blocks"],
      ["allatok-angol", "Állatok", "animals allatok", "toy animals in a row on a rug"],
    ],
    adventure: [
      ["csalad-otthon", "Család és otthon", "family home csalad otthon", "a cosy house with lit windows"],
      ["iskola-angol", "Iskola", "school iskola classroom", "a school bag with books and a pencil case"],
      ["etel", "Étel és ital", "food drink etel ital", "a breakfast table with fruit and juice"],
      ["szabadido", "Szabadidő és hobbik", "hobby hobbi szabadido sport", "a football, a guitar and a kite"],
      ["nyelvtan-angol", "Alap nyelvtan", "grammar nyelvtan present simple", "puzzle blocks forming a sentence shape"],
    ],
    studio: [
      ["utazas", "Utazás", "travel utazas holiday", "a suitcase with a map and a passport"],
      ["igeidok", "Igeidők", "tense igeido past present", "a clock and an arrow timeline"],
      ["kultura-angol", "Angol nyelvű országok", "britain usa london", "a red double-decker bus and a clock tower"],
    ],
    laboratory: [
      ["kommunikacio-angol", "Kommunikáció", "communication kommunikacio levelezes email", "a laptop with chat bubbles"],
      ["media-angol", "Média és technológia", "media technology technologia", "a smartphone and headphones"],
      ["kornyezet-angol", "Környezet", "environment kornyezet", "a green city park with colorful recycling bins, a bicycle and young trees"],
    ],
    future: [
      ["erettsegi-angol", "Érettségi felkészülés", "exam erettsegi", "an exam desk with a dictionary"],
      ["munka-angol", "Munka és jövő", "work career munka jovo", "an office desk with a globe and a plant"],
      ["globalis-angol", "Globális témák", "global globalis issues", "a globe with speech bubbles"],
    ],
  },
  nemet: {
    adventure: [
      ["alapok-nemet", "Alapok", "hallo grundlagen alap", "two speech bubbles with a small black-red-gold ribbon"],
      ["csalad-nemet", "Család és otthon", "familie csalad otthon", "a cosy alpine house with a garden"],
      ["iskola-nemet", "Iskola", "schule iskola", "a school bag and a pretzel"],
    ],
    studio: [
      ["szabadido-nemet", "Szabadidő", "freizeit szabadido", "a bicycle beside a lake"],
      ["nyelvtan-nemet", "Nyelvtan", "grammatik nyelvtan nevelo", "colored building blocks in three groups"],
      ["kultura-nemet", "Német nyelvű országok", "deutschland osterreich berlin", "a city gate and a river boat"],
    ],
    laboratory: [
      ["utazas-nemet", "Utazás", "reisen utazas", "a train in a mountain valley"],
      ["media-nemet", "Média", "medien media", "a tablet with news cards"],
      ["kornyezet-nemet", "Környezet", "umwelt kornyezet", "a forest path with recycling bins"],
    ],
    future: [
      ["erettsegi-nemet", "Érettségi felkészülés", "prufung erettsegi", "a desk with a dictionary and notes"],
      ["munka-nemet", "Munka és tanulás", "arbeit studium munka", "a university building and a briefcase"],
      ["tarsadalom-nemet", "Társadalom", "gesellschaft tarsadalom", "a town square with people silhouettes"],
    ],
  },
  francia: {
    adventure: [
      ["alapok-francia", "Alapok", "bonjour alap", "two speech bubbles with a small blue-white-red ribbon"],
      ["csalad-francia", "Család és otthon", "famille csalad", "a house with blue shutters and flowers"],
      ["iskola-francia", "Iskola", "ecole iskola", "a school bag and a croissant"],
    ],
    studio: [
      ["szabadido-francia", "Szabadidő", "loisirs szabadido", "a bicycle with a baguette basket"],
      ["nyelvtan-francia", "Nyelvtan", "grammaire nyelvtan", "colored blocks forming two groups"],
      ["kultura-francia", "Francia nyelvű országok", "france paris", "a café terrace and a tall iron tower in the distance"],
    ],
    laboratory: [
      ["utazas-francia", "Utazás", "voyage utazas", "a sunny coast with a sailboat"],
      ["media-francia", "Média", "medias media", "a laptop with news cards"],
      ["kornyezet-francia", "Környezet", "environnement kornyezet", "lavender fields beside a small solar panel and colorful recycling bins"],
    ],
    future: [
      ["erettsegi-francia", "Érettségi felkészülés", "examen erettsegi", "a desk with a dictionary"],
      ["munka-francia", "Munka és tanulás", "travail etudes", "a briefcase and a university building"],
      ["tarsadalom-francia", "Társadalom", "societe tarsadalom", "a town square with silhouettes"],
    ],
  },
  informatika: {
    adventure: [
      ["digitalis-eszkozok", "Digitális eszközök", "eszkoz tablet szamitogep", "a friendly robot holding a tablet"],
      ["algoritmus-adv", "Algoritmusok", "algoritmus lepes utasitas", "a robot following arrows on a grid"],
      ["biztonsag-adv", "Biztonság az interneten", "internet biztonsag jelszo", "a padlock shield over a tablet"],
    ],
    studio: [
      ["programozas", "Programozás", "programozas kod blokk ciklus", "colorful code blocks snapping together"],
      ["adatok", "Adatok és táblázatok", "adat tablazat diagram", "a spreadsheet grid with bar charts"],
      ["halozat", "Hálózat és internet", "halozat internet", "connected devices with glowing links"],
    ],
    laboratory: [
      ["algoritmizalas", "Algoritmizálás", "algoritmus rendezes kereses", "sorted bars rising like a staircase"],
      ["adatbazis", "Adatbázisok", "adatbazis tabla lekerdezes", "stacked database cylinders glowing"],
      ["mi-alapok", "Mesterséges intelligencia", "mesterseges intelligencia", "a stylised neural network of glowing nodes"],
    ],
    future: [
      ["szoftverfejlesztes", "Szoftverfejlesztés", "szoftver fejlesztes projekt", "a laptop with abstract code blocks and a coffee cup"],
      ["kiberbiztonsag", "Kiberbiztonság", "kiberbiztonsag titkositas", "a glowing shield over a circuit board"],
      ["mi-hasznalat", "MI-használat", "hasznalat chatbot", "a friendly abstract assistant interface with nodes"],
      ["erettsegi-info", "Érettségi felkészülés", "erettsegi felkeszules", "a desk with a laptop and notes"],
    ],
  },
  "enek-zene": {
    explorer: [
      ["dalok", "Dalok és mondókák", "dal mondoka enek", "music notes floating above a meadow"],
      ["ritmus", "Ritmus", "ritmus taps dob", "a small drum and clapping hands shapes"],
      ["hangszerek-exp", "Hangszerek", "hangszer csorgo furulya", "toy instruments on a rug"],
    ],
    adventure: [
      ["nepdalok", "Népdalok", "nepdal nepzene", "a folk-art pattern with music notes"],
      ["hangjegyek", "Hangjegyek", "hangjegy kotta szolmizacio", "big friendly notes on a staff without letters"],
      ["hangszerek-adv", "Hangszerek", "hangszer xilofon", "a xylophone and a recorder"],
    ],
    studio: [
      ["zenetortenet", "Zenetörténet", "zenetortenet barokk klasszikus", "a harpsichord in an elegant room"],
      ["zenei-formak", "Zenei formák", "zenei forma rondo", "a spiral of musical notes"],
      ["mai-zene", "Mai zene", "pop rock mai zene", "headphones and a guitar"],
    ],
    laboratory: [
      ["romantika-zene", "Romantika", "romantika liszt chopin", "a grand piano by a window"],
      ["xx-szazadi-zene", "XX. századi zene", "bartok kodaly", "a folk instrument beside a modern score"],
      ["filmzene", "Filmzene és média", "filmzene media", "a film reel with music notes"],
    ],
  },
  "hit-es-erkolcstan": {
    explorer: [
      ["szeretet", "Szeretet és barátság", "szeretet baratsag", "two hands holding a small heart"],
      ["csalad-hit", "Család", "csalad", "a warm home with a lit window"],
    ],
    adventure: [
      ["ertekek", "Értékek", "ertek becsulet", "a dove with an olive branch"],
      ["kozosseg-hit", "Közösség", "kozosseg segitseg", "people holding hands in a circle"],
      ["unnepek", "Ünnepek", "unnep karacsony husvet", "a candle and a wreath"],
    ],
    studio: [
      ["etika", "Etika", "etika rossz dontes", "a wooden signpost at a sunny forest crossroads with two paths and a small lantern"],
      ["vallasok", "Világvallások", "vallas vilagvallas", "several different sacred buildings on a hill"],
      ["felelosseg", "Felelősség", "felelosseg dontes", "a lantern lighting a path"],
    ],
    laboratory: [
      ["emberi-meltosag", "Emberi méltóság", "meltosag jog", "a balance with a heart"],
      ["kapcsolatok", "Kapcsolatok", "kapcsolat baratsag szerelem", "two paths joining under a tree"],
    ],
    future: [
      ["filozofia", "Filozófiai kérdések", "filozofia ertelem", "a thinker's bench under a starry sky"],
      ["tarsadalmi-etika", "Társadalmi etika", "tarsadalom igazsagossag", "a scale with a book and a heart"],
    ],
  },
  "vizualis-kultura": {
    explorer: [
      ["szinek", "Színek", "szin festes", "a painter palette with bright colors"],
      ["formak-vk", "Formák és rajz", "rajz forma vonal", "crayons drawing loops on paper"],
    ],
    adventure: [
      ["festes", "Festés", "festes ecset", "brushes in a jar with color splashes"],
      ["kezmuves", "Kézműves munka", "kezmuves agyag papir", "clay figures and paper crafts on a table"],
      ["muveszettortenet-adv", "Művészet régen", "muveszet barlangrajz", "cave paintings beside a modern easel"],
    ],
    studio: [
      ["terabrazolas", "Térábrázolás", "perspektiva ter", "a drawing tablet showing a perspective grid"],
      ["design", "Tervezés és design", "design tervezes plakat", "a designer's desk with swatches"],
      ["fotografia", "Fotó és mozgókép", "foto film", "a camera beside a color wheel"],
    ],
    laboratory: [
      ["muveszettortenet", "Művészettörténet", "muveszettortenet reneszansz", "a classical sculpture in a gallery"],
      ["media-vk", "Média", "media kep", "a camera and a laptop with an image"],
    ],
    future: [
      ["kortars-muveszet", "Kortárs művészet", "kortars installacio", "a modern gallery with an abstract sculpture"],
      ["epiteszet", "Építészet", "epiteszet epulet", "modern and classical buildings side by side"],
    ],
  },
  technika: {
    explorer: [
      ["epites", "Építés", "epites kocka", "toy building bricks and a small hammer"],
      ["anyagok-tech", "Anyagok", "papir anyag", "paper, wood and fabric samples"],
    ],
    adventure: [
      ["szerszamok", "Szerszámok", "szerszam csavarhuzo", "a toy screwdriver, gears and a wrench"],
      ["haztartas", "Háztartás", "haztartas fozes", "a tidy kitchen with simple tools"],
    ],
    studio: [
      ["tervezes-tech", "Tervezés", "tervezes rajz terv", "gears with a ruler and a pencil like a design plan"],
      ["kozlekedes-tech", "Közlekedés", "kozlekedes jarmu", "a bicycle and a city bus"],
    ],
  },
};

/** A teljes taxonómia (csak a tanított tantárgy × sáv párok). */
export const TOPICS: Topic[] = (Object.entries(T) as Array<[CatalogSubject, Partial<Record<DesignBand, Row[]>>]>).flatMap(([subject, bands]) =>
  (Object.entries(bands) as Array<[DesignBand, Row[]]>).flatMap(([band, rows]) =>
    rows.map(([key, label, keywords, motif]) => ({ subject, band, key, label, keywords: keywords.split(" ").filter(Boolean), motif }))));

/** A témakör borítójának azonosítója. */
export const topicCoverId = (t: Pick<Topic, "subject" | "band" | "key">) => `cover-${t.subject}-${t.band}-${t.key}`;

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * A lecke témaköre: előbb a katalógus-témakör, aztán a cím alapján (ékezettűrő). Review #277:
 * - a témakör saját CÍMKÉJE elsőbbséget kap (a cím szavai sorban, szóelejesen tartalmazzák: „Síkgeometria”, „Másodfokú egyenletek”);
 * - ha több témakör címkéje is illik (pl. „Törtek, geometria és mértékegységek témazáró”), nincs témakör — a lecke a sáv hősét
 *   kapja (terv: a több témakörös összefoglaló nem kap témaköri borítót);
 * - különben a kulcsszavak, de csak ha mind ugyanarra a témakörre mutatnak; csak a bemeneti szó kezdődhet a kulcsszóval
 *   (a fordított egyezés a „mondat” szót a hosszabb „mondatresz” kulcsszóra illesztette).
 * Nem tanított pár vagy nincs egyezés: null.
 */
const STOP = new Set(["a", "az", "es", "egy", "the", "and"]);
const words = (text: string) => fold(text).split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
function labelHit(textWords: string[], label: string): boolean {
  const lw = words(label);
  if (!lw.length) return false;
  for (let i = 0; i + lw.length <= textWords.length; i++) if (lw.every((w, j) => textWords[i + j].startsWith(w))) return true;
  return false;
}
export function topicKeyOf(input: { subject: string; classroom: number; title: string; topicArea?: string | null }): Topic | null {
  const subject = subjectKeyOf(input.subject);
  if (!subject) return null;
  const band = designThemeForClassroom(input.classroom);
  if (!Object.hasOwn(SUBJECT_BANDS, subject) || !SUBJECT_BANDS[subject].includes(band)) return null;
  const candidates = TOPICS.filter(t => t.subject === subject && t.band === band);
  const classify = (text: string | null | undefined): Topic | null | undefined => {
    if (!text) return undefined;
    const tw = words(text);
    const labelled = candidates.filter(t => labelHit(tw, t.label));
    if (labelled.length === 1) return labelled[0];
    if (labelled.length > 1) return null; // több témakör — összefoglaló
    const keyed = candidates.filter(t => t.keywords.some(k => k.length >= 3 && tw.some(w => w.startsWith(k))));
    if (keyed.length === 1) return keyed[0];
    return keyed.length > 1 ? null : undefined;
  };
  // A katalógus-témakör (ha van és egyértelmű) nyer; különben a cím. A „több témakör” döntés (null) is végleges.
  const fromArea = classify(input.topicArea);
  if (fromArea !== undefined) return fromArea;
  return classify(input.title) ?? null;
}
