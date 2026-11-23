---
name: blind-bug-hunting-reviewer
description: "A független ellenőr VAK és hibakereső; 2026-11-19 óta a gépi futtató (openai/gpt-6.2-sol, high) adja a kötelező ítéletet, exclusive BE; Gemini-sor nincs"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-19T15:52:40.684Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** az ellenőr vak és hibakereső, a kötelező ítéletet a gépi futtató adja: `openai/gpt-6.2-sol`, `reasoning.effort: high`, `blindReview.exclusive` BE. A lentebbi DeepSeek / Qwen / „kapcsoló KI” pontok csak ELŐZMÉNY, nem érvényes szabály. A futtató helye: `.claude/worktrees/vak-v2` (ág `chore/vak-ellenor-konvergencia`), a főágon még nincs (hibajegyzék H-05).

A tulajdonos 2026-11-18-án három lépésben rögzítette:

1. A külső (Gemini) „második vélemény” sort ki kell venni a kapukból — az csak egyszerű ellenőrzés volt. „A lényeg az, hogy mindig
   egy vak alügynök ellenőrizze az elvégzett munkádat, hogy biztosan megtalálja a hibákat. Olyan típusú pontot is írj neki, amiben
   kifejezetten hibakeresésre utasítod.”
2. „A vak ellenőr szabály legyen repó szintű… bármilyen mesterséges intelligencia-ügynök környezetben futtatom a repó fejlesztését,
   javítását, az szerezzen róla tudomást és aszerint fusson.”
3. „Építsd meg azt, hogy a független vak ellenőr minden esetben a DeepSeek V4.1 Flash … modell legyen, hogy valóban teljesen
   független és olcsó modell ellenőrizze a munkádat. Ezáltal csökkentjük a drága Anthropic modellek költségét is.” Majd: „valóban
   kizárólag a DeepSeek ellenőr modell fusson minden esetben”. A pontos modellt kérdőíven választotta:
   `deepseek/deepseek-v4.1-flash-1017` (OpenRouter).

4. MODELLCSERE ugyanaznap: „Qwen 4 Max modellekre állítsd át a DeepSeek Flash modelljét, mert az megint kontextus-pazarló, ha az
   ő összes jelentését neked ellenőrizned kell. Olcsóbban jövünk ki egy autonóm módon is megbízhatóan működő ellenőrrel.” Az
   érvényes modell: `qwen/qwen4-max` (OpenRouter). A DeepSeek-hivatkozások alább elavultak, a futtató ugyanaz.

**Why:** a megerősítő jellegű ellenőrzés a fejlesztő következtetését igazolja vissza; aznap több hibát csak vak, a kódot futtató
ellenőr talált meg (#510 négy közepes lelete, az adventi felület öt közepes lelete). A DeepSeek a függetlenségért (nem Anthropic)
és a költségért kell.

**How to apply:**
- Minden elkészült munkára (PR előtt és minden javító feltöltés előtt) vak, hibakereső ellenőrzés: az ellenőr csak a tervet /
  tulajdonosi célt és a fejet kapja; a fejlesztő jelentését és a saját várakozásomat nem. Feladatra szabott hibakereső pontok,
  futtatás / ellenpróba, kötelező „Mit próbáltam megtörni, és nem sikerült” és „Mit NEM vizsgáltam” szakasz. Visszanézésnél is.
- A futtató: WEBSULI `npm run gate:blind-review` (skill: `websuli-vak-ellenor`), a `chore/vak-ellenor-deepseek` ágon épül
  (`scripts/qa/gates/blind-review/`); az ágról is futtatható más fejekre, amint működik. ELLENŐRIZD, hogy létezik-e már a
  főágon, mielőtt hivatkozol rá.
- Amint a futtató működik, Anthropic-alügynököt vak ellenőrnek NEM indítok; ha a futtató nem tud lefutni (OpenRouter-hiba,
  költségplafon), megállok és a tulajdonos dönt — nincs csendes tartalék. Addig (a futtató elkészültéig) az átmeneti megoldás
  Anthropic vak alügynök volt.
- Kulcs: `OPENROUTER_API_KEY`, csak folyamaton belül, soha nem kiírva (lásd [[api-keys-location]]); a nyilvános repóba nem kerül.
- A szabály a globális `~/.claude/CLAUDE.md` „Szkriptkapuk” szakaszában is szerepel (2026-11-18-án beírtam).

Az én megjegyzésem (nem a tulajdonosé): az első alapvonal-mérés (a két ismert hibás fejen) mutatja meg, a közepes leletek mekkora
részét találja meg az olcsó modell — az eredményt számokkal kell a tulajdonos elé vinni. Kapcsolódó: [[quality-gates-mandate]],
[[runtime-script-guards]].

5. DÖNTÉS ugyanaznap, a mért alapvonal után (kérdőív): „Kapjon böngészőt és DB-t, addig marad a mai.” — a kizárólagosság
   kapcsolóhoz kötött (`blindReview.exclusive`, alapból KI): az ítélet a vak alügynöké, a futtató kiegészítő; BE csak a küszöb
   (≥ 7/9 közepes lelet) teljesülése és tulajdonosi jóváhagyás után. A fenti „KIZÁRÓLAG” mondatok ezzel felülírva.

6. MODELLCSERE 2026-11-19 (tulajdonos): „A teljes ökoszisztémában az ellenőr, független ellenőr modellt cseréld le skillekben,
   Agent MD fájlokban, memóriákban, a GPT-6.2 SOL modellre high efforttal.” Érvényes: `openai/gpt-6.2-sol`, `reasoning.effort:
   high`, `blindReview.exclusive` BE — a futtató ítélete a kötelező, Claude-alügynök vak ellenőrként nem indul. Az 5. pont és a
   Qwen / DeepSeek hivatkozások ezzel elavultak. Részletek: [[blind-review-runner]].
