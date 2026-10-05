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
