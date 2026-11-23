---
name: foszal-allapot
description: "A WEBSULI főszála 2026-11-22 óta a „Felhős szálak összevonása” session; PR-onkénti állapot, vak körök, tulajdonosi döntések, újraindítás utáni folytatás"
metadata:
  node_type: memory
  type: project
  originSessionId: d097beb9-f3f3-4a20-9287-4601fbd79418
  modified: 2026-11-23T02:12:06.526Z
---

2026-11-22 este a tulajdonos döntése: „Te vagy a főszál” → a fejlesztés a „Felhős szálak összevonása” sessionben fut. A régi főszál
(„Websuli fejlesztés leltározása”, session 5e40d429) a gép újraindításakor leállt, átadó jegyzet nélkül. Az állapotot a munkafákból
és a `websuli-qa-evidence`-ből raktam össze. A régi szál riportjai a régi scratchpadban vannak:
`C:\Users\kosaz\AppData\Local\Temp\claude\ae863587c521e3ec\5e40d429-1a44-43d0-a815-181a3773f233\scratchpad\review-*`.

Vak körök (2026-11-22): #510 12 kör (az utolsó 4 NEM), TGM S5a 2 kör NEM, kisfilm-leállítás (fix/kisfilm-leallitas-hatarido) 6 kör NEM,
#513 1 kör NEM, #522 1. kör IGEN FELTÉTELLEL (feltételek L1–L3 jegyre: eseményszűrő-őr, címzés-őr, komment szövege).
Tulajdonosi döntés (űrlap, 2026-11-22): a #510-re, az S5a-ra és a kisfilm-leállításra EGY UTOLSÓ kör. Ha az is NEM, akkor nincs több
kör: #510 → a lelet követő PR-ba, és a hatókörről a tulajdonos dönt; S5a → PR-bontás; kisfilm → a gyártás KI marad, a DB-visszaigazolás
külön PR-ba kerül.

Eredmények (2026-11-22 este): S5a 3. kör IGEN FELTÉTELLEL (54e5518f; PR még nincs, az ágnak nincs távoli párja); #522 IGEN
FELTÉTELLEL, pusholva; #529 1. kör NEM → a naplóvédelem javítva (350e5a91); #513 2. kör NEM (a blokkolók 1-ről 2-re nőttek) →
javítva (21780cc5); kisfilm záró kör NEM → a leállítás utáni írás javítva (27470aac). Második tulajdonosi döntés: a #513-ra és a
kisfilmre még EGY, utolsó kör; ha NEM, bontás (a kisfilmnél a gyártás KI marad). A csapdasorszámok ütköznek: a #529 és a #510 is
C-97-től számoz — amelyik később olvad be, az számoz át.

Késő esti állás (2026-11-22): #522 IGEN F, pusholva, a Copilot-szál megválaszolva és lezárva → CI után merge. #510 14 kör után NEM,
a UUID-commit visszavonva (389ea8c3); tulajdonosi döntés: BONTÁS 9 szeletre — terv JÓVÁHAGYVA:
`docs/specs/2026-11-22-eredmeny-email-bontas.md` + `-vegrehajtas.md` (ág: `docs/eredmeny-email-bontas`, munkafa `eredmeny-bontas`);
sorrend B1→B2→B3→B4→B5a→B5b→B6→B7→B8, halmozás nélkül. #513 és kisfilm-leállítás: az utolsó kör is NEM → bontás (a kisfilm-gyártás
KI marad); a bontási tervük még nincs megírva. #529: utolsó kör jóváhagyva (9c46b4a7). S5a: PR-kapu a sorban.

#529 utolsó (3.) kör NEM (9c46b4a7) — a blokkoló már az élesítési eljárás (az útmutató egyjelenetes próbája teljes fejezetet indít, és
nulla videóval is zöld), nem a kód → a döntés szerint BONTÁS: (1) modellcsere + naplóvédelem (kód), (2) élesítési eljárás + valódi
egyjelenetes próbaszkript; a kisfilm-gyártás KI marad. Adventi flaky DB-teszt javítva külön PR-ban (`fix/advent-teszt-sorsolasfuggetlen`,
1ed1dc68). B1a kész (`feat/eredmeny-b1-datum-korhatar`, 21a8d34b). A docs-pótlás PR parkol (a terv elavult a későbbi döntésekhez képest).

TGM-lánc (tulajdonosi utasítás 2026-11-22 éjjel: „a régi ágakat olvasd be, keresd meg a hiányosságokat, készítsd el a teljes
fejlesztést”). Beolvadt: #522 (Bence-csere), #531 (adventi flaky teszt). Nyitva, CI-n: #530 S5a (7c833d19, IGEN F), #532 B1a (96678217,
IGEN F). Helyben kész, v2 ágakon (mind az előzőre épül, PR csak az előző beolvadása után): `feat/tgm-s5b-v2` (munkafa tgm-s5b, d097595f,
stage zöld), `feat/tgm-s6a-v2` (tgm-s6a, 185a42d8, stage zöld). `feat/tgm-s2b1-v2` (34ea7810): 1. vak kör NEM (2 valódi blokkoló:
fa-elrendezés, SVG-azonosítók) → javítva, 2. (visszaellenőrző) kör fut. Hátravan sorban: S6b (e08862b0, 2b477759, c0924a29), S2b-2
(31613031, 56bdbe67, 271009c6, 3e101941), S6c (85850874, 8ec3df80, a2e20570, 4c8b34bc; két részre bontandó), SK2 (8b7313e4, c208c040,
ce6db8a3), majd S3a / S3b (csak terv van). ISMÉTLŐDŐ HIBAOSZTÁLY az áthozott szeletekben: futás közbeni `lessonVarietyEnabled()` (környezet)
olvasás az `effectiveLessonVariety()` / `varietyOn` helyett — minden áthozott szeletben grep-pel keresendő és javítandó, teszttel.

2026-11-23 hajnal: #532 (B1a) BEOLVADT (9e292c0f, telepít). #530 S5a: a C-61 miatt main-beolvasztás + új kör (IGEN F) + push (34dafdac),
CI fut → utána gate:merge + merge. TANULSÁG: a ci.yml-t érintő PR elé ne olvassz be mást (a main elmozdulása új CI-t és új vak kört kér).
`feat/tgm-s6b-v2` kész helyben (tgm-s6b, 0ba333b8, stage zöld; ugyanaz a hibaosztály 3 helyen javítva). S2b-1: 2. kör NEM (a saját
szöveges névterezésem 2 hibája) → DOM-szintű névterezés (9df94e3c), a tulajdonos jóváhagyta a 3. kört (--owner-override), fut.
Következő: S2b-2, S6c (bontva), SK2, S3a / S3b; a lánc PR-jai sorban: S5a → S5b → S6a → S6b.

2026-11-23 reggel: #530 (S5a) BEOLVADT (dfe2ac50). S5b: main ráolvasztva (a squash miatti 11 ütközés a saját oldallal feloldva —
ellenőrizve, hogy a main ezekben azonos az ág alapjával), a main-hez mért diff tisztán S5b (20 fájl, +431 / −32), stage zöld; sorban:
böngészős próba, gate:push, 1. vak kör. #533 (S2b-1): 3. kör IGEN F, PR nyitva; a review-botok 6 leletét javítottam helyben (2c7669fa,
0a1cae47: kilógó felirat a gyártási kapun, véges szintű fa-séma, szöveghatárok a forrásleltárral egyezően), a végső fejre kapu + kör
sorban, utána push + válasz a 5 szálra (comment_id: 4660555219, 4660555750, 4660571320, 4660571344, 4660571363, 4660571391, 4660571411).
NYITOTT DÖNTÉS: forrásfa (4 szint, 4 ág) vs megjelenítő (3 szint, 13 csomópont) — az S3a tervezésénél. MÓDSZER a lánc többi szeletéhez:
squash-merge után `git merge origin/main`, az ütköző fájloknál előbb `git diff <régi alap> origin/main -- <fájl>` (AZONOS → `--ours`).
TANULSÁG: vak kört csak akkor indíts, amikor a review-botok leletei már beérkeztek és javítva vannak (különben a kör régi fejre megy).

2026-11-23 délelőtt: S5b (`feat/tgm-s5b-v2`, 9c67d3a7): 1. kör NEM (L1–L4 mind javítva), 2. kör IGEN F (jegyre: L6 nyitókapcsoló KI +
évfolyamváltás, L7 v1-javítás lektorlistája); PR-leírás kész (`scratchpad/s5b-pr-body.md`), a PR-kapu fut → utána push + PR. S2b-1 (#533,
4b14b37e): 5 kör; a 4–5. kör blokkolói a SAJÁT kilógófelirat-javításaimból jöttek (olvasási úton is futott; a közös becslőt módosítottam)
→ a közös `illustrationLayoutProblems` visszaállt a főágéra, a kártyák kapuja csak a kiszámolható helyet ítéli; a tulajdonos jóváhagyta az
utolsó kört (--owner-override), fut. Ha NEM: a kilógófelirat-ellenőrzés teljesen ki a PR-ból. TANULSÁGOK: (1) hívók ellenőrzése, MIELŐTT
azt állítom, hol fut egy ellenőrzés; (2) közös (a főágon is használt) függvényt szeletben nem módosítok; (3) review-bot kérésére beépített
új ellenőrzés maga is új felület — kis, szűk formában vagy külön PR-ban.

A régi főszál a konvergencia-őr TILOS jelzése ellenére indított köröket (S5a 3., kisfilm 7.) — ez ugyanaz a hibaosztály, mint a kanban
„SAJÁT HIBA” kártyája. Teendő: az őrt a `gate:blind-review` futtatóba kell építeni.

**Why:** egy újraindítás egyszer már elvitte az állapotot. A sort és a döntéseket ne kelljen újra összerakni.
**How to apply:** session elején olvasd el, utána `git worktree list` és a `websuli-qa-evidence` legfrissebb fájljai. A felhős szálakat
lásd: [[felhos-szalak-geptelenseg]]; a merge-sor a főszálé: [[orchestrator-owns-all-websuli-flows]]; a körök korlátja:
[[vak-kor-konvergencia]].

Állás 2026-11-23 hajnal (kontextus-tömörítés után): főágon #522, #531, #532 (B1a), #530 (S5a). S2b-1 = PR #533: záró (7.) vak kör
IGEN F, fej 617825a2 pusholva, 7 review-szál megválaszolva és lezárva, CI után `gate:merge` → merge. A kilógófelirat-ellenőrzés
tulajdonosi döntéssel KIVÉVE (külön jegy, böngészős getBBox-mérés); jegyre: ismétlődő `websuli-paper` DOM-azonosító, L11 teszt.
S5b = PR #534: a 6 Copilot / Codex lelet javítva (dd124c7d: `openingForm` a job állapotában, `runOpeningForm`,
`orderMethodsByQuota`, `gateCountProblem`), 3. (követő) vak kör a `kapu-sor-23.sh`-ból; utána válasz a 6 szálra
(`r534-*.md` a scratchpadban). Sorrend utána: S6a → S6b (munkafák készen), S2b-2, S6c, SK2, S3a/S3b; B1b; bontási tervek (#513,
kisfilm, #529). Tanulság: a tároló (`pipeline-store.upsertLesson`) is újraszámolta a jelölőt — egy javításnál MINDEN író helyet
grep-pel kell leltározni, nem csak a motort.

Állás 2026-11-23 reggel: főágon #533 (S2b-1, ae57953a) és #534 (S5b, 412854e3). S2b-2 = PR #535 (fej 5db1cfc4, 3 vak kör, mind IGEN F;
szálak lezárva; CI után merge-kapu, majd beolvasztás). S6a = PR #536 (fej 17cb0074; 1. kör NEM: mohó kiosztás + záró recap
sorazonosság → visszalépéses keresés a VÉGLEGES blokksorokon; 2. kör IGEN F; botok leleteire és CI-ra vár). S6b (munkafa tgm-s6b,
cdcf5885): az S6a-ra igazítva (`planSections` a végleges sorokkal, try-pótlás a szabályok megtartásával), szakaszkapu zöld; PR az S6a
beolvadása után (cél: `cel-s6b.md` még megírandó). Utána S6c (két részre), SK2, S3a/S3b. Tanulságok: (1) python heredocban a dupla
visszaperjel egyre esik össze → visszaperjeles kódot fájlból futó szkripttel, `chr(92)`-vel írj; (2) a PR-nyitó parancs mellé nem
tehető csővezeték (kapu-hook), és a hook a parancs SZÖVEGÉBEN szereplő kulcsszóra is illeszt; (3) a „végleges kimeneten mérj”
invariáns minden utólagos átalakításra (recap, try) újra érvényesítendő.

2026-11-23 délelőtt: #535 (S2b-2) beolvadt (f7f94f22). S6a (#536): Copilot-lelet → kiderült, hogy a kiosztott terv nem jutott el a
szerzőhöz (javítva: a szerzői kérés kimondja a sorokat); 3. vak kör NEM (jóváhagyott terv folytatása) → `sectionShapes` eredetjelző
a job állapotában; a főág beolvasztva (dok-ütközés), 4. kör a `kapu-sor-30.sh`-ból fut. Tanulság: PR-t a sorban úgy ütemezz, hogy a
közös terv-dokumentumot érintő másik PR beolvadása ELŐTT ne induljon vak kör (a beolvasztás új fejet és új kört kényszerít);
megszakított háttérsor után a `timeout … npm run gate:push` folyamatfa árván marad — pontos PID-del kell leállítani.

2026-11-23 délelőtt (2): #536 (S6a) beolvadt (c87d1706). Advent PR-C: 4. vak kör IGEN F (1adcfef5), de a PR-kapu 1 óra után elbukott —
gyökérok a KAPUBAN: a böngészős tesztek kiválasztása részszóra megy, a `sync.ts` miatt mind a 83 teszt futott. Javítás külön ágon:
`fix/kapu-spec-valasztas-szohatar` (munkafa `kapu-spec`, 86497a14; 83 → 6 teszt), sorban az S6b 2. köre mögött (`kapu-sor-34.sh`,
már a kapusor-zárral). Beolvadása után: `git merge origin/main` az advent-c ágon → push-kapu → követő vak kör → PR-kapu → PR.
S6b: 1. kör NEM (3 blokkoló) → javítva (16824ffe), 2. kör fut. S6c (`feat/tgm-s6c-v2`), SK2 (`feat/tgm-sk2-v2`), B1b
(`feat/eredmeny-b1b-kliens-mezok`, b7a32c5b) előkészítve. Audit: 34 beolvadt ág + 13 munkafa törölve; secret-guard visszakötve;
hibajegyzék és `websuli-szelet-futoszalag` skill létrehozva (lásd [[hosszu-futas-vezenyles]]).
