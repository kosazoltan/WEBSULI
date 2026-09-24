# Magyarázó ábrák — a primitív ábragenerátor lecserélése (2026-09-24)

Tulajdonosi kérés: „A magyarázó ábra generátor nagyon primitív… a holdciklusokhoz csak egy kört rajzolt… nézd át a skilljeit, a lélekfájlokat, a modelljét.”

## Diagnózis (bizonyított)
| # | Ok | Bizonyíték |
|---|---|---|
| 1 | A rajzolók primitívek: a `geometry` egyetlen címke nélküli kör/háromszög/négyzet; a `map` pöttyök egy keretben; a `timeline` pöttysor; a `process` szövegdobozok nyilakkal | `client/src/lesson-runtime/blocks/animate-blocks.tsx:115-130` (kör = `<circle r=32>`), `:132`, `:149`, `:95` |
| 2 | Nincs szabad illusztráció, ciklus/fázis, címkézett ábra, diagram, halmazábra, térbeli test | `shared/lesson-schema.ts:25-36` ANIM_KINDS (10 fajta); `params: z.record(z.unknown())` |
| 3 | A modell legtöbbször NEM is fut: ha minden fejezetben van kidolgozott példa, az „ábra” a példa lépéseinek szövege `process`-ként | `server/studio/section-visuals.ts:21-48`, `step-runner.ts:495-521`; mindhárom 2026-09-24-es élő futásban „Ábrák eszközből, modellhívás nélkül” |
| 4 | A skill maga is a `process`-t ajánlja elsőként („az example lépéseiből process ábrát készíts”) | `server/studio/role-skills.ts:137` |
| 5 | Az ábra-modell a legolcsóbb szöveges modell (glm-5.3-flash, tartalék deepseek-v4-flash) — rajzi/téri feladatra nem ez a jó választás | `server/ai/models.ts:69`, `:92` |
| 6 | A „lélek” (runtime-knowledge SOUL) az ábrákról semmit nem mond; a lektor nem méri, hogy az ábra magyaráz-e | `shared/runtime-knowledge.ts:6` |
| — | Mért eset: „Az időszámítás…” lecke (01638ae9): az egész leckében 1 ábra, `process`, 3 szöveges lépés („Hold változása → holdnaptár”…) | DB `lessons.json` |

## Cél
Minden fejezet ábrája a fogalmat MUTASSA (tárgy, viszony, változás, arány, térbeli alak), ne a szöveget ismételje. Pontos, forráshű, olvasható, telefonon is.

## Nem-cél
Fotó/képgenerálás (pixeles AI-kép); a meglévő leckék tömeges újragenerálása (külön döntés); Gemini (tulajdonosi tiltás).

## Megoldás — 4 szelet (mindegyik külön PR, ≤ ~400 sor)
1. **Gazdag, paraméteres rajzolók** (determinisztikus, mindig pontos):
   - `cycle` — körbe rendezett fázisok nyilakkal, címkével, rövid magyarázattal; opcionális `moon` fázisrajz (megvilágított rész a fázis szerint, növő/fogyó) → holdciklus, víz körforgása, évszakok.
   - `labeledShape` — sík- és térbeli alakzat oldal/él-/csúcscímkékkel, méretekkel (téglalap, háromszög, kör sugárral, téglatest a×b×c élekkel, rétegekkel).
   - `barChart` — összehasonlító oszlopdiagram értékekkel, átlagvonallal.
   - `venn` — 2–3 halmaz címkékkel és darabszámokkal.
   - `numberLine` bővítése: tetszőleges tartomány, jelölt pontok, ugrás-ívek.
   - A régi fajták paramétereinek zod-sémája; ismeretlen/hibás paraméternél NEM rajzol kitalált alapértéket („1. lépés”), hanem kihagyja az ábrát.
2. **Szabad illusztráció (`illustration`)**: az ábra-modell SVG-t ír (pl. a Hold fázisai a Föld körül, sejt részei, Magyarország folyói). Szerveroldali szigorú tisztítás (csak alap SVG-elemek; nincs script, `foreignObject`, külső hivatkozás, eseménykezelő; ≤ 30 KB; kötelező `viewBox`; minden `<text>` a lecke szövegéből), kliensen újratisztítás (isomorphic-dompurify SVG-profil).
3. **Folyamat**: a determinisztikus `process`-ábra csak TARTALÉK (modellhiba esetén), nem helyettesíti a modellt. Az ábra-modell erős modell (döntés: lent). Skill újraírása: fejezetenként a legmagyarázóbb fajta; `process` csak valódi eljárásra; tilos a példa szövegét dobozba tenni.
4. **Minőségkapu**: gépi ellenőrzés (a `process` lépései nem lehetnek a példa szó szerinti lépései; illusztráció-címkék forráshűsége; minimális tartalom fajtánként); a lektor skill méri: „mutatja-e az ábra a fogalmat”.

## Edge case-ek
- Nincs rajzolható tartalom (pl. definíció-fejezet) → nincs ábra (nem töltelék); a kapu ezt elfogadja, ha a fejezet nem core-számolás/folyamat/tér.
- Hibás SVG vagy tiltott elem → az illusztráció kimarad, a naplóba kerül; nem blokkolja a leckét.
- Régi leckék: a régi fajták ugyanúgy rajzolódnak (visszafelé kompatibilis olvasás).
- Kis képernyő: minden ábra `viewBox`-szal skálázódik, szöveg ≥ 12 px a 375 px széles nézetben.

## Elfogadás (EARS, mérhető)
- HA a lecke holdfázisokat tanít, AKKOR a fejezet ábrája `cycle` (moon) vagy `illustration`, legalább 4 megnevezett fázissal — élő futáson mérve.
- HA minden fejezetnek van példája, AKKOR is lefut az ábra-modell (a „modellhívás nélkül” napló csak modellhibánál jelenik meg).
- Az 1. szelet rajzolói: unit-teszt + valódi böngészős render (375 px és asztali), átfedés/levágás/görgetősáv nélkül, képernyőképpel.
- Tisztító: ismert támadó SVG-k (script, onload, foreignObject, külső href) mind kiesnek — teszt.
- Élő futás: a felvételi PDF és egy holdciklusos anyag leckéjének ábráiról képernyőkép a jelentésben.

## Döntések és mérések (3. szelet)
- **Tulajdonosi döntés (2026-09-24):** ábra-modell `claude-opus-5-5` (közvetlen Anthropic, élő próbahívás HTTP 200), tartalék `gpt-5.6-terra`. Render: nincs `STUDIO_MODEL_ANIMATOR` felülírás, az Anthropic-kulcs megvan.
- **Folt-kimenet:** a modell csak ábrákat ad (`server/studio/visual-patch.ts`), nem a teljes leckét → kicsi kimenet, a tanítás szerkezetileg érintetlen.
- **Külön „visuals” szabály** (300 s, 16k, medium): az „animator” szabály a bankhívásokra is érvényes, azt nem változtatjuk.
- **Élő mérés az „időszámítás” leckén (5 hívás):** 20–27 s, ~13,7k be / 2,3–3,1k ki token; 4/5 hibátlan folt (0 elutasított ábra), 1/5 nem folt-alakú JSON → egyszeri célzott újrakérés ugyanazon a modellen. Minden ábraadat a lecke szövegéből (ellenőrizve). A skill pontosítása után a holdnaptárhoz holdfázis-ciklus készült.
- **Böngészős mérés a valódi kimeneten:** levágott „1 évszázad” jelölés → a feliratok a rajzterületen belül; a sorszám-jelvény `var(--card)` shadcn-formátum miatt fekete volt → témától független színek; feliratok a téma szövegszínével (kontraszt ≥ 14:1 mindkét témában).
- **Spec-változás tesztekben (dokumentált):** `models-routing` (ábra-modell) és a (n2) runner-teszt (a 09-19-es eszköz-kiváltás megszűnt; most a modell foltját illesztjük be).

## 4. szelet — megvalósítás
- `server/studio/visual-quality.ts`: gyenge ábra = `echo` (a fejezet példájának lépései ≥ 50 %-ban), `outline` (geometry), `broken` (a rajzoló nem rajzolná ki). Nem blokkol.
- Futtató: gyenge ábra után EGY célzott újrakérés az ábrakészítőnek (a friss blokkszámokkal, `replace`), a csere csak érvényes, szerződéshű folt esetén kerül be; hiba esetén a lecke megy tovább.
- Lektor skill 6. pont: a szöveget ismétlő, a fogalmat nem mutató ábra `language` jegyzet (nem blokkoló); a skill 4800 karakteren belül.

## 2. szelet — megvalósítás és mérés
- `shared/illustration-svg.ts`: allowlistes tisztítás (isomorphic-dompurify), csak belső `url(#…)`, kötelező `viewBox`, ≤ 30 000 karakter, ≤ 400 elem, legalább egy felirat; a feliratok szavai (4 betűs tő, számok pontosan) a lecke szövegéből; becsült elrendezés-ellenőrzés: telefonos betűméret (317 px tartalomszélesség, ≥ 11,5 px), egymásra csúszó és kilógó felirat. A kliens megjelenítés előtt ugyanazzal újratisztít.
- Az elutasított ábrák oka a célzott újrakérésbe kerül.
- Élő mérés (Opus 5.5, „időszámítás”): 1. hívás 3 illusztráció, 11,1 px-es betű telefonon (böngészőben mérve) → szerződés: font-size ≥ 16 / 400 szélesség + elrendezés-ellenőrzés; 2. hívás: 3 illusztráció, 0 elutasítás, telefonon min. 12,7 px, nincs levágás. A böngésző „átfedése” a kétsoros feliratoknál a betűdoboz mellékhatása volt (képen ellenőrizve: nincs valódi átfedés).
- Számegyenes: tíz azonos „1 évszázad” ugrásfelirat egymásra csúszott → ütközéskor egy sorral feljebb, ≥ 3 azonos felirat csak egyszer; 375 px-en 0 átfedés.
