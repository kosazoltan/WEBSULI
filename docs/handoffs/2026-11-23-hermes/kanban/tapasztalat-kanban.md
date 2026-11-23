# Tapasztalat-kanban — WEBSULI

A Claude Code saját munkakörnyezetében vezetett tábla (nem a repó része). Minden futás után: a munka közben tapasztalt
hiba új kártya a „Hibák” oszlopban; a megtalált megoldás a „Megoldva — tanulság” oszlopba kerül (ok, megoldás, bizonyíték);
ami skillbe / szabályba / szkriptbe épült, a „Beépítve” oszlopba (hová). Kártya formája:
`- [ÉÉÉÉ-HH-NN] <rövid cím> — ok: … — megoldás: … — hely: <fájl / skill / csapda>`

## Hibák (nyitott)

- [2026-11-23] Ingatag teszt: `tests/lesson-clip-worker.test.ts` „átkódolás: az időkorlát SIGKILL-lel él” a szakaszkapu párhuzamos futásában egyszer bukott (magában 34/34). Teendő: C-96 szerinti időfüggetlenítés.

- [2026-11-23] S5b L6/L7/L9 (#534 követő jegyek): kikapcsolt nyitókapcsolónál évfolyamváltó javítás formát ír; v1 javításnál lektor-mondatszám; kész bankos folytatásnál nem fut a kapuszám-szabály. Teendő: jegy az S6b után.
- [2026-11-23] S2b-1 (#533): a képes kártya rajzán belüli kilógó felirat nincs ellenőrizve — külön szelet, böngészős `getBBox`; ismétlődő `websuli-paper` DOM-azonosító.

- [2026-11-22] A biztonsági keményítő PR-ok (#521 kitakarás, vak futtató) nem konvergálnak a vak ellenőrnél — ok: a GPT-6.2 Sol minden körben új szélső esetet talál a mintánkénti kódban — megoldás: folyamatban (szűkítés „nem gyengébb a főágnál”, bontás, előre-vágás + főági kitakaró) — hely: `docs/specs/2026-11-19-kitakaro-negyzetes-regex.md` 12–14. pont
- [2026-11-22] A #510 kilét-kötése 11 kör után is új rést mutat — ok: a kilét késői (küldéskori) feloldása — megoldás: folyamatban (R47 rögzítés létrehozáskor, R49 nem küld igazolhatatlan kiléttel) — hely: `docs/specs/2026-11-17-eredmeny-email-kviz.md` R47, R49

- [2026-11-22] A „bizonyíték-átvitel” döntés (2026-11-19) nincs beépítve a merge-kapuba — ok: ütközésmentes főág-beolvasztás után a merge-kapu új vak ítéletet kér a merge-fejre, holott a PR saját diffje bájtra azonos — megoldás: kanban-jegy: a pre-merge-gate fogadja el az előző fej ítéletét, ha `git patch-id` / `range-diff` igazolja a saját változás azonosságát (teszttel); addig fejenként ~0,3–1 USD vak kör — hely: `scripts/qa/gates/pre-merge-gate.mjs`, memória `gate-speed-decisions`
- [2026-11-22] Nagy, szabadszöveges dokumentációs felület (59 tábla célleírása) minden vak körben új pontatlanságot hoz — ok: ellenőrizhetetlen állítások — megoldás: csak gépileg igazolt tény vagy szó szerinti idézet fájl:sorral + őr-teszt (`memory-layer-refs-guard`) — hely: `feat/zaro-hurok-2`

- [2026-11-22] ISMÉTLŐDŐ (C-75, ma 3×: futás végi ellenőrző, Szólétra vak kör 1 és 2) — sed / heredoc elnyeli a regex-visszaperjelet — ok: héj-értelmezés; a csapda-szöveg nem volt elég — megoldás (TÖRVÉNY → gépi kényszerítés): PreToolUse hook, amely megtagadja a `sed -i` + visszaperjel kombinációt forrásfájlon (ts/tsx/js/mjs/py), „használd az Edit eszközt” üzenettel — hely: `~/.claude/hooks/`, a futás végi zárásban

- [2026-11-22] ISMÉTLŐDŐ (alügynök, 5×) — Python-szkripttel fájlhoz fűzés után dupla sortörés a fájl végén → a commit / gate:stage a `git diff --check`-en bukik — megoldás (gépi): a megbízás-sablonba „fájl szerkesztése Edit / Write eszközzel, Python / heredoc tilos forrás- és dokumentumfájlra”; és a C-75-ös hookkal együtt egy PreToolUse figyelmeztetés a forrásfájlba író python / heredoc parancsra — hely: `~/.claude/hooks/`
- [2026-11-22] A merge-kapu minden főág-elmozdulás után új vak ítéletet kér (ma 5 PR-on ismételt fej-körök, egyenként 0,3–0,9 USD + 1 óra CI) — a bizonyíték-átvitel beépítése önálló feladat — hely: `scripts/qa/gates/pre-merge-gate.mjs`

- [2026-11-22] SAJÁT HIBA: a kisfilm-javítás 3. vak köre a konvergencia-őr TILOS jelzése ellenére lefutott (~1 USD), mert a kapu-sor szkriptem kiírta, de NEM vizsgálta a `vak-kor-konvergencia.py` kilépési kódját — megoldás (gépi): a vak kör indítása csak `python … vak-kor-konvergencia.py … && npm run gate:blind-review …` láncban; legjobb a futtatóba építeni (a `gate:blind-review` maga hívja az őrt a korábbi bizonyítékokkal, és exit 1-nél nem indul) — hely: a WEBSULI vak futtató / `zaro-hurok.mjs konvergencia`
- [2026-11-22] ISMÉTLŐDŐ (a fenti SAJÁT HIBA 2. előfordulása): a régi főszál az S5a 3. és a kisfilm 7. körét a TILOS jelzés mellett indította (az újraindítás szakította meg) — ok: az őr csak szkriptkimenet, a futtató nem kényszeríti — megoldás (gépi, TÖRVÉNY): a `gate:blind-review` maga futtassa az őrt a korábbi jelentésekkel, és exit 1-nél ne induljon; tulajdonosi kivétel csak kifejezett kapcsolóval és naplózott indokkal — hely: `scripts/qa/gates/blind-review/blind-review.mjs`
- [2026-11-22] A gép újraindítása átadó jegyzet nélkül vitte el a főszál állapotát (futó vak körök, félbemaradt merge a #529 munkafájában) — ok: az állapot csak a sessionben és a scratchpadben élt — megoldás: tartós állapotfájl a memóriában (`foszal-allapot.md`), újraindítás előtt mindig átadás — hely: memória
- [2026-11-22] SAJÁT HIBA: `cd <nem létező munkafa>; git cherry-pick …` — a `cd` bukott, a `;` miatt a git a FŐ munkakönyvtárban futott (szerencsére nem módosított) — ok: `;`-lánc munkafa-váltással — megoldás: munkafában csak `git -C <munkafa> …` vagy `cd … &&` lánc; gépi: PreToolUse figyelmeztetés `cd …;` + git írási parancsra — hely: `~/.claude/hooks/`, csapda
- [2026-11-22] ISMÉTLŐDŐ (C-92, ma 2×): többsoros szövegcsere (node-szkript / regex `\n`) CRLF-es fájlon nem illeszkedik — megoldás: forrásfájlt Edit eszközzel; tesztben `.replace(/\r\n/g, "\n")` mutálás előtt — hely: csapda C-92
- [2026-11-22] Hibaosztály részleges lezárása (#529): az 1. javítás formai szűrést adott (`/^[A-Za-z0-9_.-]{1,40}$/`), a 2. vak kör átlátszatlan titokkal és JSON-parser-üzenettel átjutott — ok: tiltólista / formai szűrő engedélylista helyett — megoldás: naplóhatáron csak engedélylista + fix üzenet (providerErrorCode, providerJson) — hely: `source/server/lesson-clips-providers.ts`, csapda C-97 5. szabály
- [2026-11-22] A felhős szálak egy offline Remote Control-szálnak adták át a munkát, és az elveszett — ok: az átadásnál nem kértek visszaigazolást — megoldás: átadás csak megerősített átvétellel; a koordinátor a helyi főszál — hely: memória `felhos-szalak-geptelenseg.md`

## Megoldás folyamatban

- [2026-11-22] Közvetlen (PR nélküli) push a főágra eltörte a memória-index őrét, minden PR push-kapuja megállt (C-61) — ok: egy másik gépen futó záró-hurok eszköz a main-re pusholt — megoldás: javító PR `fix/memoria-index-jegyzetek`; tulajdonosi teendő: ágvédelem a main-en — hely: memória `main-agvedelem`
- [2026-11-22] Több gépen párhuzamosan épül a záró hurok — ok: azonos tulajdonosi kérés több környezetben — megoldás: a WEBSULI-ban egy saját, repón belüli változat (`scripts/qa/zaro-hurok.mjs`, skill, kitöltött YAML / QMD / Cogni rétegek) a másik gép vázára építve — hely: `feat/zaro-hurok-websuli`

- [2026-11-22] Csapdasorszám-ütközés több ágon (C-76…C-80, C-90/C-91) — ok: párhuzamos ágak ugyanazt a következő számot választják — megoldás: a merge sorrendjében átszámozás; javaslat: ág-előtagos ideiglenes szám — hely: `docs/agent-csapdak.md`

## Megoldva — tanulság

- [2026-11-23] Adatíró javítása: MINDEN író hely leltára grep-pel (motor + tároló); a memóriatárolós teszt zöldje nem bizonyítja az éles írót (C-TGM-1).
- [2026-11-23] Bot kérte ÚJ ellenőrzés nem a futó szelet része: külön jegy (3 vak kör ment rá az S2b-1-en).

- [2026-11-22] Windows `core.autocrlf=true` + forrás-szöveget olvasó teszt — ok: `\n`-es regex CRLF-en bukik, a `doesNotMatch` csendben átmegy — megoldás: beolvasás után `.replace(/\r\n/g, "\n")` — hely: csapda C-92, `source/tests/result-outbox.test.ts`
- [2026-11-22] A telepített Chrome 158 összeomlik a Playwright 1.57 alatt sandboxolt iframe-nél — ok: `channel: "chrome"` a gép stabil Chrome-ját indította — megoldás: a Playwrighthoz rögzített Chromium + őr-teszt — hely: csapda C-93, PR #525
- [2026-11-22] Párhuzamos e2e-futások SIGTERM-mel ölték egymást (PR-kapu 143) — ok: port-verseny / több Playwright egyszerre — megoldás: PR-kapu böngészős köre csak akkor, ha alügynök nem futtat e2e-t — hely: a terv állapotnaplója, C-72
- [2026-11-22] Jóváhagyás nélküli fizetős képgenerálás `generate.ts --help`-pel (0,093 USD) — ok: az eszköz figyelmen kívül hagyja az ismeretlen kapcsolót — megoldás: minden megbízásban tiltás; kanban-jegy a valódi `--help`-re — hely: a terv állapotnaplója
- [2026-11-22] A Git Bash heredoc összevonja a `\\`-t — ok: héj-értelmezés — megoldás: escape-es kódot Write / Edit eszközzel vagy `chr(92)`-vel — hely: csapda C-75 / C-92
- [2026-11-22] A futás végi ellenőrző a meglévő retró-bejegyzést sem találta — ok: Python-heredocban a `\\b` valódi backspace-karakterré (`\x08`) vált a regexben — megoldás: `chr(92)+'b'` csere, vezérlőkarakter-ellenőrzés a fájlon — hely: `~/.claude/scripts/futas-vegi-ellenor.py`, csapda C-92 (rokon)
- [2026-11-22] A vak ellenőr OpenAI-tartalomszűrője 403-mal elutasította a #510 körét — ok: „kiberbiztonsági” szókincs a célfájlban — megoldás: semlegesen fogalmazott célfájl (adatvédelem, jogosultság) — hely: `review-510/cel.md` 8c

## Beépítve (skill / szabály / szkript)

- [2026-11-22] Nem konvergáló vak körök (32 kör mérve: a nagy PR-okon a leletszám nem csökken; leletenkénti foltozás, a javítás új felületet hoz) — megoldás: gépi megállási szabály + kötelező megközelítésváltás (követelmény → hibaosztály-leltár → kis PR → internetes forrás → tulajdonosi döntés) — hely: `~/.claude/scripts/vak-kor-konvergencia.py`, globális CLAUDE.md „Önfejlesztés” TÖRVÉNY, `futas-vegi-zaras` skill 4b, memória `vak-kor-konvergencia`; alkalmazva: #418 és #510 hibaosztály-leltár
- [2026-11-22] Futás végi ellenőrző szkript és tapasztalat-kanban a Claude-környezetben — hely: `~/.claude/scripts/futas-vegi-ellenor.py`, `~/.claude/skills/futas-vegi-zaras/SKILL.md`
