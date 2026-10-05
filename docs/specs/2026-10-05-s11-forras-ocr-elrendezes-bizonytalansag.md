# S11 — Forrás-javítás: gyenge kép OCR-je — elrendezés-szemantika és bizonytalanság (tulajdonosi döntés, 2026-10-05)

Tulajdonosi döntés: „Forrás-javítás előbb” (a 2. teljes élő futás után). Előzmény: S9/S10 (vezérlés, orkesztrátor) kész — a megállások
mély oka forrás-oldali.

## Mért kiindulás (élő futások 2026-10-05, Mezopotámia-füzetfotó; feltérképezés fájl:sorral)
- A füzet „Ázsia, Közel-Kelet térsége” sorát az OCR „Kesia, Föld - Felt. térsége”-nek olvasta; a kettős olvasás 10 eltérést talált, a
  döntő olvasás után a vita NYOMA ELVESZETT (`dualReadOcr` → `string`, `ocr.ts:202-227`). Az extract-skill 6. lépése (`role-skills.ts:46`)
  a definícióban „a képen olvasható szándékolt alakot” kéri → „Ázsia, a Föld keleti térsége” tényként került a térképbe és a publikált
  leckébe (a937b8a7). Ugyanígy: „kézművesek” → „bérművesek” (map aecdf69f).
- A keretes, sorrendes „társadalom” lista (élén → előkelők → parasztok) sima sorokká vált (`ROLE_SKILLS.ocr`, `role-skills.ts:56-83`:
  nincs keret/sorrend/rangsor-konvenció) → a lektor minden „alsó réteg”-tanítást forrásellenesnek ítélt → 9 kapu-jelzés, megállás.
- Az OCR-skill 2. lépése / 74. sora: bizonytalan szónál „a témához illő legközelebbi valós szó” — a téves, de hihető csere forrása.
- A szó szerinti idézet-ellenőrzés csak azt igazolja, hogy az idézet az átiratban van (`verbatim.ts:180`), azt nem, hogy helyes.

## Cél
1. **Elrendezés az átiratban** (`ROLE_SKILLS.ocr`): keret → `[KERET: <felirat>]` … `[KERET VÉGE]`; a kereten/listán belüli sorrend
   megőrzése fentről lefelé, `1.`, `2.`, … sorszámmal, ha a lap elrendezése sorrendet mutat (egymás alatti bejegyzések egy keretben,
   „élén:” jellegű vezérszóval); nyíl → `→`. A jelölők az átirat részei (a szó szerinti idézet így a sorrendet is hordozza).
2. **Bizonytalanság megőrzése:** a döntő olvasás után is vitatott (a két olvasat > 2 szerkesztésre eltér, vagy a döntő olvasat egyik
   olvasattal sem egyezik) szakasz az átiratban `⟦?⟧` jelet kap a végén; az OCR-skill bizonytalan szónál NEM cserél „hihető” szóra,
   hanem az olvasott alakot hagyja `⟦?⟧`-lel.
3. **Bizonytalan forrás nem lesz tény:** a fogalom, amelynek idézete `⟦?⟧`-et tartalmaz, `pending` (nem tanítjuk, `TAUGHT_REVIEW_STATES`),
   amíg tanári kérés / helyesbítés nem rendezi; az extract-skill a `⟦?⟧`-es részt a definícióban nem „értelmezi” át.
4. Az orkesztrátor/kapu változatlan.

## Nem-cél
Új OCR-modell; képfeldolgozás (kontraszt); a tanári helyesbítés útjának módosítása.

## Edge case-ek
- Nyomtatott, tiszta kép: nincs `⟦?⟧`, a keret-jelölő csak valódi keretnél → a meglévő futások viselkedése érdemben változatlan.
- Ha minden kulcsfogalom `pending` lenne → a meglévő `autonomousApprovalDecision` (≥ 1 igazolt core, ≥ 60 %) dönt — nem új szabály.
- A `⟦?⟧` és a `[KERET…]` jelölő a gyereknek szóló szövegbe nem kerülhet (a szerző a definíciót tanítja, nem az idézetet) — teszt.
- OCR-gyorsítótár: a prompt-hash a kulcsban → az új skill friss olvasást ad.

## Elfogadás (EARS)
- HA a döntő olvasás után is vitatott szakasz marad, AKKOR az átiratban `⟦?⟧` jelöli, és a rá épülő fogalom `pending`.
- HA a lapon keretes, sorrendes lista van, AKKOR az átiratban `[KERET: …]` és sorszámozott sorok állnak (mérés: a Mezopotámia-fotó
  OCR-je — csak OCR-hívás, néhány cent — a „társadalom” keretet sorszámozva adja).
- A gyereknek szóló leckében nincs `⟦?⟧` / `[KERET` jelölő (teszt).
- Teljes unit, tsc, lint zöld; a meglévő OCR-tesztek a dokumentált változásig változatlanok.

## S11/2 — harmadik, erős olvasó a vitatott helyekre (tulajdonosi döntés 2026-10-05, a friss élő futás után)
Mért: a friss futás az S11-gyel „túl bizonytalan átirat” hibával megállt (10 fogalomból 3 igazolt; 11 eltérés a két olvasó között).
Szabály: ha a döntő átiratban `⟦?⟧` maradt, egy erős látómodell FÜGGETLENÜL újraolvassa az oldalt; minden jelölt vitánál a 2 a 3-ból
szavazás dönt (a harmadik olvasat tokenre egyezik az egyik vitatott olvasattal → az nyer, a jel lekerül); egyezés nélkül a jel marad.
A harmadik olvasó NEM írhat új szöveget (csak a két meglévő olvasat közül választ). Hibánál/hiánynál a jelölt átirat marad (fail-safe).
Elfogadás: a Mezopotámia-fotón a jelölt helyek többsége feloldódik, a térkép gépi jóváhagyása átmegy, és a „Közel-Kelet” sor nem válik
hamis ténnyé (vagy helyes, vagy jelölt marad).

## S11/3 — olvasó-kiesés: az erős olvasó lép a helyére (tulajdonosi döntés 2026-10-05, a 6. élő futás után)
Mért (map 59c174d8, lesson 25a11aba): a második olvasó NÉMÁN kiesett (`dualReadOcr`: hibás/üres második olvasatnál napló nélkül az első
olvasat ment tovább) → nem volt vita, jelölés, harmadik olvasat; a „Kesia, Föld - Felt.” ellenőrizetlenül „a Föld keleti térsége” tény
lett és publikálódott. Szabály: bármelyik alap-olvasó kiesésekor (hiba vagy üres válasz) a kiesés és oka naplózva; az erős olvasó
(OCR_THIRD_READER_MODEL) olvasata lép a helyére — két független olvasat, a meglévő döntő olvasás és jelölés; a 2 a 3-ból szavazás ilyenkor
elmarad (az erős olvasat már az egyik). Ha az erős olvasó is kiesik: a régi viselkedés, de NAPLÓZVA és „degraded”.

## Review #192 — jelölés pontosítása (2026-10-05)
- A `⟦?⟧` a vita SAJÁT helyére kerül (a döntő átirat az első olvasathoz igazítva), nem az azonos szó első előfordulására.
- Jelölt a Cél 2 szerint a döntő átirat minden olyan változtatása is, amely egyik vitatott olvasattal sem egyezik (harmadik alak),
  betűnyi vitánál is; és az egyoldalú (beszúrás/törlés) érdemi vita, ha a nem üres olvasat a döntő átiratban megvan.
- S11/2 egyoldalú vitánál: a nem üres olvasat harmadik olvasatbeli megléte dönt (benne van → marad jel nélkül; nincs → kikerül).

## S11/4 — egyező félreolvasás: szótár-őr + erős olvasó (tulajdonosi döntés 2026-10-05, a 7. élő futás után)
Mért (map b6647e0c, lesson a894e033): a két alap-olvasó UGYANAZT a zagyva sort adta („Kesia, Föld - Felt. térsége”,
„Lepesztető toronytemplom”) → nem volt vita, jel, harmadik olvasat; a szerző a nem-szavakból hihető mondatot rakott össze
(„Ázsia a Föld keleti térsége” — a füzetben „Ázsia, Közel-Kelet térsége”) → téves tény publikálódott.
Előzetes próba (hunspell-asm 4.0.2 + dictionary-hu 3.0.0, MIT / MPL-1.1, 116 ms betöltés): jelzi a Kesia, Felt, Lepesztető, bódex
szót; átengedi az Ázsia, Közel-Kelet, zikkurat, folyóköz, öntözéses, toronytemplom, kézművesek szót; tévesen jelzi a „sumérok”,
„Hammurapi”, „Kr” alakot (ezért a szótár egyedül nem dönt).

### Szabály
1. A döntő (jelölt) átirat minden szavát a magyar helyesírási szótár ellenőrzi (szám, ⟦?⟧, [KERET…], rövidítés-lista kivételével).
2. A nem-szót tartalmazó SOROKAT az erős olvasó (OCR_THIRD_READER_MODEL) a képpel FÜGGETLENÜL újraolvassa (csak ezeket a sorokat
   kapja, sorszámmal; a két alap-olvasat nem kerül a promptjába — nem horgonyozzuk).
3. Döntés soronként:
   - az erős olvasat a kérdéses szavakban egyezik az alap-olvasattal (3 olvasó egyezik) → marad, jel nélkül (a szótár nem ismeri);
   - eltér, és az erős olvasat minden szava átmegy a szótáron → az erős olvasat lép a helyére (napló: régi → új);
   - eltér, és az erős olvasatban is van nem-szó, vagy az erős olvasó hibázik/hiányzik → a kérdéses szó után ⟦?⟧ (S11 szerint:
     a rá épülő fogalom pending, a szerző nem tanítja).
4. Szerző-skill: a forrásszöveg értelmetlen, nem létező szavaiból (OCR-zaj) tényt kikövetkeztetni tilos; ⟦?⟧-es részt nem tanít.
5. Fail-safe: szótár-betöltési hiba → nincs csere, a régi viselkedés, de napló „degraded”.

### Review #194 — pontosítás (2026-10-05)
- A kérdéses szó MINDEN előfordulása után ⟦?⟧ (az ismétlődő „Kesia Kesia” mindkét tagja).
- Az erős sor csak akkor lép a helyére, ha MINDEN szava átmegy a szótáron — az idegen-szöveg kihagyás (> 40 %) az erős sorra nem érvényes.
- A szótár-őr az egyolvasós úton (nincs/azonos második olvasó) is fut: a végső átirat mindig ellenőrzött.
- A célzott erős olvasás HIBÁJA → ⟦?⟧ és „degraded” (nem kerül cache-be; a következő futás újrapróbálja). Eltérés az S11/2-től
  tudatosan: ott a harmadik olvasat hibájánál a jelölt átirat cache-elhető (a vita nyoma megmarad, a jel nem vész el); itt a hiba
  átmeneti (429 / időtúllépés), és a cache-elt ⟦?⟧ véglegesen pending-be tenné a rá épülő fogalmat. A HIÁNYZÓ erős olvasó nem hiba,
  hanem konfiguráció (a cache-kulcsban benne van) → nem „degraded”.

### Nem-cél
Új OCR-modell; képfeldolgozás; a tanári helyesbítés útja; az S11/2 2-a-3-ból szavazás módosítása.

### Edge case-ek
- Tiszta nyomtatott kép: nincs nem-szó → nincs plusz hívás (költség 0).
- Tulajdonnév / szakszó, amit a szótár nem ismer („sumérok”): az erős olvasó megerősíti → marad.
- Rövidítés („Kr. e.”, „pl.”, „stb.”): kivétel-lista.
- Idegen nyelvű forrás (angol lecke): a szótár-őr csak magyar tantárgynál / magyar szövegnél fut (a nem-szók aránya > 40% → kihagyva).
- Az erős olvasó egész sort ad vissza: csak a sor cserélődik, a többi szöveg változatlan.

### Elfogadás (EARS)
- HA mindkét alap-olvasó ugyanazt a nem-szót olvassa, AKKOR az erős olvasó újraolvassa a sort; szótár-helyes eltérő olvasat → csere;
  különben ⟦?⟧ — és a „Kesia, Föld - Felt.” sorból NEM lesz „a Föld keleti térsége” tény (mérés: a Mezopotámia-fotó OCR-je, csak OCR).
- A szótár által nem ismert, de az erős olvasó által megerősített szó jel nélkül marad (teszt: „sumérok”).
- Tiszta szövegnél nincs plusz modellhívás (teszt).
- Teljes unit, tsc, lint zöld; a meglévő OCR-tesztek változatlanok.
Mérés (2026-10-05, csak OCR + célzott erős olvasás): a szótár 3 sort jelzett (Kesia, Felt, sumérok, határak). A „Kesia, Föld - Felt.”
sor ⟦?⟧-t kapott (nem lesz belőle tény); „papok és határak” → „papok és katonák” (a fotóval egyező, a tanári helyesbítés szerint);
a „sumérok” megerősítve, jel nélkül.
