# Évfolyam-bank 3–6. évfolyam (JBa) — gyártás, vak megoldás, tantárgyi audit

- **Dátum:** 2026-11-16 · **Szelet:** JBa (terv D18, JB-A1; végrehajtás `### JB`) · **Kanban:** #42
- **Eredmény:** évfolyamonként 90 → **285** tétel (+195), tárgy × sáv cellánként **18–20** (a cél ≥ 270 / ≥ 18).
- **Gyártó:** Claude Opus 5.5, évfolyamonként egy alügynök (4 párhuzamosan), előre kiosztott, évfolyamok között diszjunkt
  témalistával. **Integrátor:** Claude Opus 5.5.
- **Vak megoldó:** 1. kör évfolyamonként egy független Sonnet-alügynök (205 kérdés = 195 új + 10 kanári); fix-kör (2. kör) egy
  független Opus 5.5 alügynök a módosított tételekre; 3. kör egy Sonnet-alügynök az utolsó cserére.
- **Tantárgyi auditor:** évfolyamonként egy független Opus 5.5 alügynök, a kulccsal és a magyarázattal együtt (mind a 195 tétel).
- **Szaktanári lektorálás:** NINCS (lásd „Maradó kockázat”).

## Módszer

1. **Cella-terv.** 5 tárgy (math, english, hungarian, science, history) × 3 sáv; cellánként 13 gyártott tétel (12 kell + 1
   tartalék). Tárgyanként évfolyamonként külön témalista (pl. matek 3.: 1000-es számkör, szorzótábla, római számok 100-ig;
   6.: LNKO/LKKT, százalék, egyenlet), a 3–6. évfolyam között diszjunkt — így a párhuzamos gyártás nem ütközött (C-31/3
   megelőzése: a tegnapi szóbanknál a párhuzamos szintfájlok sok átfedést adtak).
2. **Gyártási validátor** (scratchpad, minden gyártó maga futtatta): cellakvóta, 4 különböző opció (NFC + kisbetű +
   szóköz normalizálva), tiltott opció (mindegyik / egyik sem / mindkettő), kérdés ≤ 90, opció ≤ 40, magyarázat 40–260 karakter
   és a helyes opció szavát tartalmazza, ASCII `"` / NBSP / tab / visszaper tiltva, tiltott tartalom- és márkanév-lista,
   ismétlődő kérdés az évfolyamon (a meglévő 90-nel együtt), „a helyes opció egyedül a leghosszabb” ≤ 35% tárgyanként,
   azonos kérdés más évfolyamon (figyelmeztetés).
3. **Opció-sorrend:** a gyártó a helyes választ külön mezőben adta; az integrátor ref-alapú, determinisztikus keveréssel
   cellánként kiegyensúlyozta a helyes pozíciót (évfolyamonként 24–26% pozíciónként).
4. **Vak megoldás:** a kérdésfájl csak `qid`, tárgy, kérdés és 4 opció (kulcs, ref, kanári-jelölés nélkül, szkripttel
   ellenőrizve); a kulcs külön mappában. 10 kanári / évfolyam: tárgyanként 2 meglévő (2026-09-29-ben már vak-ellenőrzött)
   tétel szándékosan rossz kulccsal. A megoldó előbb csak a kérdés + opciók alapján választ, a `chosen` opciószöveget is
   rögzíti, az összefűző szkript `options[answer] === chosen`-t ellenőriz (C-31/4).
5. **Tantárgyi audit** a kulccsal: ténybeli / számolási hiba, több védhető válasz, tantervi illeszkedés, kitalálhatóság,
   helyesírás, magyarázat igaza, etika, ismétlés az évfolyamon belül.
6. **Javítás** (egyetlen idempotens javító szkript a gyártói pillanatképből), majd **fix-kör vak megoldás** a módosított
   kérdés- vagy opciószövegű tételekre + 10 új kanári / évfolyam.
7. **Repó-tesztek:** a meglévő `tests/grade-quiz-bank.test.ts` (számolós ellenőrző is) és az új
   `tests/grade-quiz-bank-coverage.test.ts` (JB-A1 kvóták, normalizált egyediség, tiltott opció / karakter, olvashatósági
   korlátok, pozíció-egyensúly 18–32%, „leghosszabb = helyes” ≤ 35%, és egy FÜGGETLEN második számoló a bővítés
   matek-tételein, évfolyamonként 20–21 / 39 tétel lefedve).

## Eredmény évfolyamonként

| Évf. | Új tétel | Összesen | Cellák (új) | Vak 1. kör: egyezés | Kanári 1. kör | Megoldói eltérés → elbírálás | Audit-jelzés (hiba / gyanú / apróság) | Javított | Cserélt | Fix-kör: egyezés · kanári |
|---|---|---|---|---|---|---|---|---|---|---|
| 3. | 195 | 285 | 12–14 | 194/195 (99,5%) | 10/10 | 1 → megoldói tévedés | 0 / 6 / 15 | 15 | 4 | 9/9 · 10/10 |
| 4. | 195 | 285 | 12–14 | 195/195 (100%) | 10/10 | 0 | 1 / 2 / 15 | 16 | 2 | 10/10 · 10/10 |
| 5. | 195 | 285 | 13 | 195/195 (100%) | 10/10 | 0 | 0 / 3 / 16 | 24 | 3 | 9/9 · 10/10; 3. kör 1/1 · 10/10 |
| 6. | 195 | 285 | 12–14 | 188/195 (96,4%) | 10/10 | 7 → mind megoldói tévedés | 1 / 11 / 15 | 17 | 10 | 17/17 · 10/10 |

- `chosen`-ellenőrzés: minden körben 0 eltérés. (A 4. évfolyam 1. körös megoldója jelezte, hogy a `chosen` mezőt szkript töltötte
  ki az indexből — ez a védelmet gyengíti; a fix-körben a megoldó kézzel másolta. Lásd „Tanulságok”.)
- **Megoldói eltérések elbírálása (kulcs ellenőrizve, a tétel helyes):** 3.: `g03-hungarian-049` „hattyú” elválasztása — a kulcs
  `haty-tyú` (AkH 12.: a kettőzött többjegyű betű elválasztása), a megoldó `hat-tyú`-t adott. 6.: Aranybulla → II. András; Buda
  eleste után három részre szakadt (a tételt az audit miatt egyébként sem változtattuk, a párja magyarázatát igen); metafora →
  „Te vagy a napom.”; a 4, 9, 1, 7, 3 mediánja 4; szatmári béke; Eger várkapitánya Dobó István; „I'm going to visit”. A 6.
  évfolyamos Sonnet-megoldó 7 alaptény-tévedése miatt a 6. évfolyamon a független Opus-audit adja a fő tartalmi bizonyítékot.
- **SZINT-megjegyzések** (vak megoldó, nem hiba): 3.: 37, 4.: 19, 5.: 9, 6.: 19 — túlnyomórészt „túl könnyű”. Az audit tantervi
  jelzései alapján 6 tétel került könnyebb / nehezebb sávba (3.: 3, 4.: 3); a cellák így is ≥ 18-asok. A többi „könnyű” tétel
  az 1. sávban szándékos (alapozás, ismétlés).
- **Meglévő tétel javítása (2):** `g06-hungarian-009` „Milyen idejű az „elmentünk” ige?” — az „egyik sem, mert nem ige” opció
  (tiltott „egyik sem” minta) → „feltételes”; kulcs, azonosító, magyarázat változatlan. `g04-hungarian-003` (a második auditban,
  lásd lent): a „gólja” létező szó volt „hibás” opcióként → a tétel „pocsolya” szóra cserélve. Más meglévő tétel nem változott.

## Javított / cserélt tételek (végleges azonosító, gyártói ref, ok)

„javítás” = a kérdés lényege marad (szöveg / elterelő / magyarázat / sáv); „csere” = új tétel ugyanazon a helyen.
„teszt: sorrend-szabály” = a meglévő teszt ORDINAL-mintája a „A válasz …” szókapcsolatot sorszám-hivatkozásnak méri → a
magyarázat átfogalmazva (a teszt nem lazult). „teszt: számoló” = a „3/4 : 1/2” alakot a meglévő számoló balról jobbra
olvasta → zárójeles alak „(3/4) : (1/2)”.

### 3. évfolyam

- `g03-math-044` (g3-math-t2-13) — javítás — audit apróság/magyarázat
- `g03-math-054` (g3-math-t3-10) — javítás — audit apróság/helyesírás
- `g03-english-033` (g3-english-t2-02) — csere — audit apróság/ismétlés
- `g03-english-034` (g3-english-t2-03) — javítás — audit apróság/helyesírás
- `g03-english-056` (g3-english-t3-12) — javítás — teszt: sorrend-szabály
- `g03-hungarian-029` (g3-hungarian-t1-11) — javítás — audit apróság/helyesírás
- `g03-hungarian-037` (g3-hungarian-t2-06) — javítás — vak megoldó: kitalálható
- `g03-hungarian-056` (g3-hungarian-t3-12) — csere — audit gyanú/ismétlés
- `g03-science-021` (g3-science-t1-03) — javítás — audit apróság/helyesírás
- `g03-science-026` (g3-science-t1-08) — javítás — audit apróság/kitalálható
- `g03-science-047` (g3-science-t3-02) — csere — audit gyanú/ismétlés
- `g03-science-049` (g3-science-t3-04) — csere — audit gyanú/ismétlés
- `g03-science-050` (g3-science-t3-05) — javítás — audit apróság/magyarázat
- `g03-science-051` (g3-science-t3-06) — javítás — audit apróság/helyesírás
- `g03-science-032` (g3-science-t3-07) — javítás (sáv: t3 → t1) — audit apróság/tanterv
- `g03-science-053` (g3-science-t3-09) — javítás — audit apróság/magyarázat
- `g03-history-022` (g3-history-t1-04) — javítás — audit apróság/kitalálható
- `g03-history-045` (g3-history-t1-13) — javítás (sáv: t1 → t2) — audit apróság/tanterv
- `g03-history-031` (g3-history-t3-07) — javítás (sáv: t3 → t1) — audit apróság/tanterv

### 4. évfolyam

- `g04-math-035` (g4-math-t2-04) — javítás — audit hiba/magyarázat
- `g04-math-052` (g4-math-t3-08) — javítás — audit apróság/helyesírás
- `g04-english-049` (g4-english-t3-04) — javítás — audit apróság/kétértelmű
- `g04-english-032` (g4-english-t3-09) — javítás (sáv: t3 → t1) — audit apróság/tanterv
- `g04-english-057` (g4-english-t3-13) — javítás — audit apróság/magyarázat
- `g04-hungarian-038` (g4-hungarian-t2-06) — csere — audit gyanú/magyarázat
- `g04-hungarian-032` (g4-hungarian-t3-08) — javítás (sáv: t3 → t1) — audit apróság/helyesírás
- `g04-hungarian-056` (g4-hungarian-t3-12) — javítás — audit apróság/kitalálható
- `g04-science-029` (g4-science-t1-11) — javítás — audit apróság/tény
- `g04-science-053` (g4-science-t3-08) — csere — audit apróság/ismétlés
- `g04-science-032` (g4-science-t3-09) — javítás (sáv: t3 → t1) — audit apróság/tanterv
- `g04-science-055` (g4-science-t3-11) — javítás — audit apróság/tény
- `g04-science-056` (g4-science-t3-12) — javítás — audit apróság/kitalálható
- `g04-history-021` (g4-history-t1-03) — javítás — audit apróság/helyesírás
- `g04-history-044` (g4-history-t2-13) — javítás — vak megoldó: zavaros kérdés
- `g04-history-053` (g4-history-t3-09) — javítás — audit gyanú/magyarázat
- `g04-history-055` (g4-history-t3-11) — javítás — audit apróság/tény
- `g04-history-056` (g4-history-t3-12) — javítás — audit apróság/kitalálható

### 5. évfolyam

- `g05-math-035` (g5-math-t2-04) — csere — audit apróság/tanterv
- `g05-math-043` (g5-math-t2-12) — javítás — audit apróság/magyarázat
- `g05-english-024` (g5-english-t1-06) — javítás — teszt: sorrend-szabály
- `g05-english-031` (g5-english-t1-13) — javítás — audit apróság/magyarázat
- `g05-english-036` (g5-english-t2-05) — javítás — teszt: sorrend-szabály
- `g05-english-049` (g5-english-t3-05) — javítás — teszt: sorrend-szabály
- `g05-hungarian-019` (g5-hungarian-t1-01) — javítás — vak megoldó: pontatlan kérdés
- `g05-hungarian-024` (g5-hungarian-t1-06) — javítás — audit apróság/magyarázat
- `g05-hungarian-033` (g5-hungarian-t2-02) — javítás — audit apróság/magyarázat
- `g05-hungarian-035` (g5-hungarian-t2-04) — javítás — audit apróság/magyarázat
- `g05-hungarian-036` (g5-hungarian-t2-05) — csere — fix-kör vak megoldó: ismétlés (g05-hungarian-011); a 3. kör vak megoldója után az elterelők is cserélve (kitalálható volt)
- `g05-hungarian-054` (g5-hungarian-t3-10) — javítás — vak megoldó: két jó válasz (kanál)
- `g05-science-021` (g5-science-t1-03) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát
- `g05-science-023` (g5-science-t1-05) — javítás — audit apróság/magyarázat
- `g05-science-026` (g5-science-t1-08) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát
- `g05-science-027` (g5-science-t1-09) — javítás — teszt: sorrend-szabály
- `g05-science-037` (g5-science-t2-06) — javítás — audit apróság/helyesírás
- `g05-science-038` (g5-science-t2-07) — javítás — audit apróság/magyarázat
- `g05-science-040` (g5-science-t2-09) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát
- `g05-science-045` (g5-science-t3-01) — csere — audit gyanú/ismétlés
- `g05-science-056` (g5-science-t3-12) — javítás — audit apróság/magyarázat
- `g05-history-019` (g5-history-t1-01) — javítás — audit gyanú/ismétlés
- `g05-history-024` (g5-history-t1-06) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát
- `g05-history-033` (g5-history-t2-02) — javítás — audit apróság/kitalálható
- `g05-history-034` (g5-history-t2-03) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát
- `g05-history-036` (g5-history-t2-05) — javítás — audit apróság/kitalálható
- `g05-history-037` (g5-history-t2-06) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát

### 6. évfolyam

- `g06-math-029` (g6-math-t1-11) — javítás — audit apróság/magyarázat
- `g06-math-030` (g6-math-t1-12) — csere — audit gyanú/tanterv
- `g06-math-033` (g6-math-t2-02) — javítás — teszt: számoló (zárójel)
- `g06-math-039` (g6-math-t2-08) — javítás — audit apróság/helyesírás
- `g06-math-042` (g6-math-t2-11) — csere — audit gyanú/tanterv
- `g06-english-054` (g6-english-t3-10) — csere — audit apróság/tanterv
- `g06-hungarian-019` (g6-hungarian-t1-01) — csere — audit apróság/kitalálható
- `g06-hungarian-038` (g6-hungarian-t2-07) — javítás — audit gyanú/magyarázat
- `g06-hungarian-042` (g6-hungarian-t2-11) — javítás — vak megoldó: homályos kérdés
- `g06-hungarian-047` (g6-hungarian-t3-03) — javítás — audit apróság/magyarázat
- `g06-hungarian-051` (g6-hungarian-t3-07) — javítás — audit hiba/magyarázat
- `g06-hungarian-052` (g6-hungarian-t3-08) — csere — audit apróság/ismétlés
- `g06-hungarian-056` (g6-hungarian-t3-12) — csere — vak megoldó: két védhető válasz (sajnos)
- `g06-science-026` (g6-science-t1-08) — javítás — audit apróság/ismétlés
- `g06-science-056` (g6-science-t3-12) — csere — audit apróság/tanterv
- `g06-science-057` (g6-science-t3-13) — csere — audit apróság/tanterv
- `g06-history-024` (g6-history-t1-06) — javítás — audit gyanú/ismétlés
- `g06-history-044` (g6-history-t1-08) — csere (sáv: t1 → t2) — audit gyanú/tanterv
- `g06-history-026` (g6-history-t1-09) — javítás — audit apróság/kitalálható
- `g06-history-028` (g6-history-t1-11) — javítás — audit gyanú/ismétlés
- `g06-history-031` (g6-history-t2-01) — javítás — audit apróság/magyarázat
- `g06-history-032` (g6-history-t2-02) — javítás — audit gyanú/ismétlés
- `g06-history-036` (g6-history-t2-06) — javítás — audit apróság/ismétlés
- `g06-history-039` (g6-history-t2-09) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát
- `g06-history-041` (g6-history-t2-11) — javítás — audit apróság/kitalálható
- `g06-history-042` (g6-history-t2-12) — csere — audit gyanú/tanterv
- `g06-history-046` (g6-history-t3-02) — javítás — audit ismétlés (a párja miatt): a magyarázat elárulta egy másik tétel kulcsát


## Nem (vagy másként) átvett audit-javaslatok

- `g3-history-t2-10` (ünnep-sablon ismétlése, apróság): a javasolt csere („államalapítás → augusztus 20.”) a meglévő
  `g03-history-007`-et ismételte volna → a tétel maradt (más tényt kérdez: az őszi nemzeti ünnep).
- `g3-science-t3-07` (tüdő, túl könnyű): a javasolt csere („szív pumpálja a vért”) a meglévő `g03-science-012` → helyette
  sávváltás (3 → 1).
- `g3-science-t3-02`: a javasolt párolgás-tétel a meglévő `g03-science-013` → helyette „téli álom (sün)”.
- `g4-hungarian-t3-12`: a javasolt „Melyik kettő …” átfogalmazás helyett csak az abszurd elterelők cserélve.
- `g6-history-t1-08` / `t2-12` (reformkori anyag — a tantervi hely az auditor szerint is UNVERIFIED): a javasolt cserék helyett
  (reneszánsz palota; türelmi rendelet — vallási vonatkozás) „muhi csata a Sajónál” és „utolsó Árpád-házi király”.
- `g6-history-t2-10` („hány részre”): a csere helyett a párja (`t2-09`) magyarázatából került ki a felsorolás.
- `g6-history-t2-11`: a javasolt „Nagy Katalin” elterelő 1762–1780 között uralkodott (átfed a kérdezett időszakkal) → helyette
  „Viktória királynő”.
- `g6-hungarian-t3-08`: a javasolt határozói igeneves mondat-tétel a meglévő `t3-13` szerkezetét ismételte → „visszaható névmás”.

## Maradó kockázat (őszintén)

- **Szaktanári lektorálás nincs.** A tartalmat gépi szereplők írták és ellenőrizték (gyártó ≠ megoldó ≠ auditor, de mind
  nyelvi modell). Közös vakfolt lehetséges (C-31/1): a vak megoldó egy tételt lát, a bank egészét nem.
- **Tantervi besorolás:** a NAT 2020 / kerettanterv évfolyam-helyét a szereplők emlékezetből ítélték meg, forrásból nem
  ellenőriztük (pl. valószínűség 6.-ban, reformkor 6./7., angol a 3. évfolyamon csak korai kezdésnél). UNVERIFIED.
- **Irodalmi szöveghelyek** (János vitéz, Toldi, Egri csillagok részletei) emlékezetből; a vak megoldók és az auditorok
  egyeztek, de a szöveget senki nem nézte vissza.
- **Néprajzi / tájfüggő tények** (pünkösdi királyné, busójárás eredete) tankönyvi általánosítások.
- **Gépileg nem ellenőrizhető:** a nem számolós matek (kerekítés, sorozat, geometria szöveggel), a magyarázatok igazsága
  (csak az audit nézte), az angol tételek természetessége, a sáv (tier) pontos nehézsége, és hogy egy tétel 2–6 mp alatt
  valóban megválaszolható-e (a hosszkorlát csak közelítés). A játékon belüli valós használatot (megjelenés, válaszidő) ez a
  szelet nem mérte.
- **Csomagméret:** a bank a játéklapokkal közös, lusta `level-*.js` darabban van (a `main` csak dinamikus importtal
  hivatkozik rá, nincs előtöltve). A JBa után ez a darab 530 kB / gzip 159 kB; a négy bankfájl gzip-mérete 36 → 105 kB. A
  JBb + JBc további ~1100 tétele ~+150 kB gzip-et hozna → évfolyamonkénti lusta betöltés javasolt (ORKESZTRÁTOR-KÉRÉS a
  záró jelentésben; a `game-engine/gradeQuiz.ts` közös modul).

## Második audit (review után)

**Ok:** a #448 review-ja (Codex, Vercel Agent) három tartalmi hibát talált, amelyet sem a vak megoldó, sem az első audit nem
fogott meg: a János vitézben az Óperenciás-tengeren az óriás viszi át Jánost (nem a griffmadár; a kulcs emlékezetből íródott),
a „rajzoltatok” jelen idejű műveltető alakként is elemezhető (két védhető válasz), a „gólja” létező szó (a gól birtokos alakja).

**Módszer:** négy friss, független Opus 5.5 alügynök (magyar; történelem; természettudomány; angol + matek), mind a 780 új
tételen, a kulccsal és a magyarázattal, azzal a szabállyal, hogy minden állítást forrásból (mű szövege, AkH, Wikipédia,
szótár) igazoljon, ne emlékezetből. Források többek közt: János vitéz és Az egri csillagok (Project Gutenberg #41504,
#76235–76236), Toldi (hu.wikisource), Magyar magánhangzók, Busójárás, Déli harangszó, Hunyadi Mátyás, Magyarország éghajlata,
Északi-középhegység (hu.wikipedia), Wiktionary. Ezen felül az integrátor a magyar hunspell-szótárral (`dictionary-hu` +
`hunspell-asm`, mindkettő a függőségek között) végigfuttatta a 3–6. évfolyam ÖSSZES (meglévő és új) helyesírási tételét — ez
találta meg a meglévő `g04-hungarian-003`-at, amelyet a magyar auditor nem jelzett.

| Kategória | Átnézett tétel | Javított / cserélt (végleges azonosító) |
|---|---|---|
| (a) irodalmi / olvasmány, monda | 73 (magyar 51 + történelem-monda 22) | `g05-hungarian-053` (kulcs: óriás, XXIII–XXIV. ének), `g05-hungarian-029` (Tündérország a tenger szigete — magyarázat), `g04-history-037` (a kolozsvári bíró: fát vágat — magyarázat) |
| (b) helyesírás | 36 (+ hunspell-vizsgálat a 3–6. évfolyam összes helyesírási tételén) | `g03-hungarian-033` („gólja” → „gójja”), `g04-hungarian-003` (meglévő tétel: „gólja” → csere „pocsolya”), `g04-hungarian-032` (a rímpélda „alma – palma” helyesírási hibás → „madár – határ”) |
| (c) nyelvtani alak | 75 | `g04-hungarian-020` („rajzoltatok” → „rajzoltál”), `g05-hungarian-019` (a magyarázat szerint az e „magas nyelvállású” — téves: alsó nyelvállású, elöl képzett) |
| (d) ténykérdés | 468 (történelem 156, természettudomány 156, matek 156) | `g03-history-034` (a kádár neve NEM a kád szóból — magyarázat), `g04-history-057` (Mátyás kikiáltása Buda alatt, nem „Pesten”), `g06-history-035` (a „három tenger” legenda, nem tény), `g04-science-038` (a Börzsöny „legnyugatibb tag” forrásfüggő — kivéve), `g06-science-050` (évi középhőmérséklet 10–11 °C), `g03-science-039` („tüdeje nincs” túlzás — a tüdőshalaknak van), `g03-science-052` (a darázs „nem gyűjt mézet” túlzás — a hazaiakra szűkítve), `g06-math-027` (a négyzet is téglalap — magyarázat), `g05-math-057` (a 10 nem az élek összege — magyarázat) |
| (e) angol | 156 | `g06-english-050` (a „little people” helyes kifejezés → a „little” elterelő helyett „a”) |

Összesen **18 tétel** (2 hibás kulcs / két védhető válasz a review hármán túl: `g04-hungarian-003`, `g06-english-050`; a többi
téves vagy forrásfüggő magyarázat). A javítások a meglévő azonosítókon történtek, a vak megoldó nem futott újra rájuk (a
javított tételeket a forrást megjelölő auditor írta, az integrátor szkripttel ellenőrizte a formai szabályokat és a
hunspell-őrt).

**Új őr:** `tests/grade-quiz-bank-coverage.test.ts` „helyesírási tétel: a rossz opció nem létező szó …” — szövegkörnyezet
nélküli helyesírási kérdésnél (3–6. évf.) minden egyszavas „hibás” opciót a hunspell elutasít, a helyeset elfogadja; mutációs
próbával ellenőrizve (egy létező szó „hibás” opcióként bukást ad).

**Forrás nélkül maradt (emlékezeti, tankönyvi alapon elfogadott):** a történelemben a 3. évfolyam időegység-, család- és
mesterségtételei, az 5. évfolyam ókori / középkori tételei és az alap évszámok; a természettudományban a 3–4. évfolyam
testrész-, évszak-, halmazállapot- és alapvető állatbesorolás-tételei; az angol alapszókincs (a Cambridge / Merriam-Webster
automatikus lekérése 403); a `g04-history-044` (Kinizsi és a malomkő) mondájához szöveges forrás nem került elő; a KRESZ 21. §
(gyalogos lakott területen kívül) hatályos szövege nem töltött be (másodlagos forrás igazolja).

**Hol marad a legnagyobb kockázat szaktanári lektorálás nélkül (őszintén):**
1. **(c) nyelvtani alak-tételek** — homonim alakokra (műveltető + személyrag vs. múlt idő, -t tárgyrag vs. múlt idő jele,
   főnév / ige azonos alak) nincs gépi őr; a „rajzoltatok” hibát az első audit és a vak megoldó is átengedte, ez a minta a
   legnehezebben vehető észre.
2. **(d) történelem és természettudomány** — sok tétel csak tankönyvi emlékezeten alapul (fent felsorolva), és a sorozat két
   „magyarázat-túlzás” hibája (tüdő, darázs) mutatja, hogy a mellékállítások a gyenge pontok.
3. **(a) irodalom** — a János vitéz / Toldi / Egri csillagok tételeit most szövegből igazolták, ezért itt kisebb a kockázat;
   a népmese-, közmondás- és szólás-tételek forrás nélkül maradtak.

## Tanulságok (a csapda-katalógusba javasolt bejegyzés)

1. A gyártási validátornak a repó MEGLÉVŐ tesztjeinek szabályait is tartalmaznia kell: a `grade-quiz-bank.test.ts` ORDINAL-mintája
   a magyar „A válasz …” névelős szókapcsolatot is sorszám-hivatkozásnak méri (5 tétel), a számolója a `3/4 : 1/2` alakot balról
   jobbra olvassa (1 tétel). Megelőzés: a gyártás után azonnal a repó-teszt, nem csak a saját validátor.
2. A vak megoldónak NEM elég „a chosen-t rögzítsd”: ki kell mondani, hogy a `chosen` szöveget a megoldó maga másolja, ne szkript
  töltse ki az indexből — különben az indexcsúszás elleni védelem üres (a 4. évfolyam 1. körös megoldója így tett).
3. A Sonnet-szintű vak megoldó gyors (80–370 mp / 205 kérdés), de a 6. évfolyamon 7 alaptény-tévedést vétett; a kanári 10/10 ezt nem
   fogja meg. A tartalmi bizonyítékot a kulcsos, független Opus-audit adja; a megoldói eltéréseket egyenként el kell bírálni.
4. Az auditor javasolt cseréit is ellenőrizni kell a meglévő bankon (3 javasolt csere ismételt volna meglévő tételt, 1 új
  kétértelműséget hozott volna).
5. A Write eszköz a tesztfájlban is nyers NBSP / NNBSP karakterré írta a `\u00A0` / `\u202F` escape-et (C-31/5 megismétlődött) —
   írás után `grep -c $'\xc2\xa0'` és `perl -CSD -pi -e 's/\x{00A0}/\x5Cu00A0/g'`.

## Utólagos újra-vak kör a második audit javításain (a JBb szeletben, 2026-11-16)

A második audit 18 javított tételét vak megoldó nem oldotta meg újra — ez a JBb-ben pótolva (részletek:
`docs/measurements/2026-11-16-evfolyam-bank-7-9-vakmegoldo.md`, „A JBa (3–6.) javított tételeinek újra-vak köre”):
18 tétel + 10 kanári → 17/18 egyezés, kanári 10/10; az eltérés (`g05-hungarian-053`) megoldói tévedés, a kulcs a mű szövegéből
igazolt. A kör jelzései alapján további 3 tétel javult — `g04-hungarian-032` (kitalálható elterelők → „a verssorok egyforma
hosszát”, „a versszakok számát”, „a sorkezdő szó ismétlését”), `g06-science-050` (kitalálható elterelők → 15–16 / 5–6 / 20 fok),
`g04-history-037` (a kérdés átfogalmazva: „A monda szerint ki dolgoztatta meg Kolozsváron az álruhás Mátyást?”) —, és ezek is
újabb vak kört kaptak: 3/3 · kanári 10/10, illetve 1/1 · kanári 10/10.
