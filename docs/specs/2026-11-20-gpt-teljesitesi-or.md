# GPT teljesítési őr — a vak ellenőr ne álljon meg félúton, minden lelethez javaslatot adjon

- Dátum: 2026-11-20
- Végrehajtás: `docs/specs/2026-11-20-gpt-teljesitesi-or-vegrehajtas.md`
- Ág: `feat/gpt-teljesitesi-or` (halmozva a `chore/vak-ellenor-deepseek` `1e564a01` fejére — annak futtatójára épül:
  `docs/specs/2026-11-18-vak-ellenor-deepseek.md`)

## Tulajdonosi kérés (2026-11-20, szó szerint)

> „Az OpenAI modellek imádnak elkészíteni egy feladatot, majd megállni, mielőtt ezt végrehajtanák. Készíts ehhez egy hookot,
> scriptet, promptot, amellyel biztosítod, hogy a GPT modellek használata során ne csak megtalálja a hibát, hanem azt hajlandó legyen
> le is írni javaslatokkal, teljesen komplett módon. Értsd meg a feladat célját, a GPT modellek hiányosságait, és küszöböld ki.”

## A hiba-mód (mérve / megfigyelve)

A GPT-modellek jellemzően: (1) tervet vagy „következő lépésként megnézem…” / „ha szeretnéd…” / „folytassam?” szöveget adnak a kész
munka helyett, vagy félbehagyják a jelentést; (2) leletet javaslat nélkül írnak (nincs fájl:sor, forgatókönyv, konkrét javítás),
„…és így tovább”, „példaként néhány”; (3) kötelező szakaszt hagynak ki; (4) a hibakereső pontok egy részét kihagyják; kimeneti
korláton (finish_reason=length) csonka / üres választ adnak. A futtatóban mért eset (2026-11-20): 4–6 hívás után „IGEN, FELTÉTELLEL”
egyetlen fájlolvasással (az ok a szolgáltató volt — `1e564a01`), és a jelentés hibakereső pontjai közül több csak egy szóval szerepelt.

## Cél

1. **Prompt — teljesítési szerződés** a futtató rendszerüzenetében (`scripts/qa/gates/blind-review/futtato-kiegeszites.md`): nem
   interaktív, egyetlen munkamenet, senki nem válaszol; a megállási / felajánló fordulatok tiltottak; minden lelethez fájl:sor,
   forgatókönyv és konkrét javítási javaslat; minden hibakereső pont tárgyalva; a jelentés utolsó sora:
   `TELJESSÉG: <x> / <y> pont — HIÁNYZÓ: <azonosítók vagy „nincs”>`.
2. **Szkript — determinisztikus teljesség-ellenőrző** (`scripts/qa/gates/blind-review/completeness.mjs`):
   - kötelező szakaszok: `Ítélet`, `Leletek`, `A hibakereső pontok`, `Mit próbáltam megtörni, és nem sikerült`, `Mit NEM vizsgáltam`;
   - a hibakereső pontok listája a megbízás-sablonból (`scripts/qa/gates/vak-ellenor-megbizas.md`, 1–9) és a `--goal` fájl
     feladat-specifikus pontjaiból (`8a.`, `8b.` …; ha van ilyen, a sablon 8. helyőrzője helyett ezek számítanak) — mindegyik a
     „A hibakereső pontok” szakaszban saját sorral, ítélet-szóval (talált hiba / próbáltam / nem alkalmazható …) és tartalommal;
   - minden strukturált lelethez (`submit_report.findings`) `scenario` (forgatókönyv) és `fix` (konkrét javítási javaslat) mező,
     értelmes hosszal;
   - tiltott megállási / felajánló / csonkító fordulatok (magyar és angol): „következő lépés(ként)”, „ha szeretnéd / szeretné”,
     „folytassam”, „meg fogom nézni / megnézem / megvizsgálom”, „és így tovább”, „példaként néhány”, „next step”, „let me know”,
     „would you like”, „I will now” …;
   - a zárósor jelen van, és a benne állított `x / y` és HIÁNYZÓ-lista egyezik a gépi számítással.
   Kimenet: `{ ok, problems[], covered, total, missing[] }`.
3. **Hurok a futtatóban:** a `submit_report` a teljesség-ellenőrzésen is átmegy; bukásnál a futtató UGYANABBAN a beszélgetésben
   visszaküldi a pontos hiánylistát, a modell folytat. Legfeljebb 3 teljesség-visszautasítás; a 4. hiányos leadás (vagy a keret
   elfogyása) után a futás NEM TELJES (nem ítélet), a kilépési kód nem 0, és a hiánylista a kimeneten és a jelentésben. A
   bizonyíték `completeness: { ok, covered, total, attempts, points }` mezőt kap.
4. **`record-review`:** kizárólagos módban a teljesség-bizonyíték nélküli (vagy `ok: false`) futtató-jelentést elutasítja, és a
   jelentés szövegén a bizonyítékban rögzített pontlistával újra lefuttatja az ellenőrzőt (a jelentés nem változhat utólag).
5. **Codex CLI-burok** (`scripts/qa/gates/blind-review/codex-complete.mjs`): a `codex exec … --json -o <válasz>` kimenetén ugyanaz az
   ellenőrző; hiánynál `codex exec resume <munkamenet-azonosító> - -o <válasz>` (a hiánylista a szabványos bemeneten), legfeljebb
   3-szor. A munkamenet-azonosító a `--json` eseményfolyamból jön; ha nincs meg, a burok megáll (a `--last` más munkamenetet
   folytathatna — nem használjuk). Szintaxis a telepített 0.167.2 súgója szerint (`codex exec --help`, `codex exec resume --help`,
   2026-11-20): `codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]`, a `PROMPT` helyén `-` = szabványos bemenet, `-o` és `--json`
   támogatott.
6. **Skill + csapda:** a `websuli-vak-ellenor` skill (forrás + tükör) szabálya; csapda-bejegyzés a `docs/agent-csapdak.md`-ben.

## Kiegészítés — díjmentes életjel-felügyelet (tulajdonosi kérés 2026-11-20)

> „a GPT 6.2-es modelleknél nagyon gyakori, hogy egyszerűen csak megáll minden jelzés nélkül… alakíts ki olyan scripteket, webhook-okat,
> hook-okat, amivel folyamatosan, API-költségmentesen ellenőrzöd, hogy fut-e, és valóban dolgozik-e, vagy visszakérdezéssel leáll és
> csak várakozik…”

- **Vak futtató (OpenRouter):** streaming hívás (`stream.mjs`, `cfg.stream`): minden darab — a szolgáltató életjel-megjegyzése is —
  újraindítja a csend-órát (`streamIdleSec` = 120 s); csendnél a hívás megszakad, a futtató ugyanazokkal az üzenetekkel újrapróbál (a
  meglévő korlátos, exponenciális újrapróba és a USD-plafon szerint); a `finish_reason` nélküli stream csonka → újrapróba. A teljes
  hívás-korlát 900 s (a high gondolkodás hosszú lehet). Szívverés-fájl (`<bizonyíték-tár>/blind-review-<fej12>.heartbeat.json`)
  minden eseménynél; `heartbeat.mjs` díjmentesen megmondja: halad / beragadt / nem él / befejeződött.
- **Codex CLI (`codex-complete.mjs`):** a folyamatot a burok indítja; percenként a kimenet, a válaszfájl és a Codex munkamenet-fájl
  (`~/.codex/sessions/ÉÉÉÉ/HH/NN/rollout-*<id>.jsonl`) méretét nézi — ha `--stall-min` (25) percig semmi nem nő, a pontos folyamatfát
  leállítja, és `codex exec resume <azonosító> -` technikai folytatással megy tovább (legfeljebb `--max-net` = 8); hálózati hurok
  („Reconnecting... 5/5”, 429) a naplóban → ugyanígy. Gépújraindítás után: `--resume <azonosító>`. A „tokens used” szám a következő
  sorban, szóközös tagolással is olvasva.
- A felügyelet maga nem hív API-t; API-hívás csak a félbehagyott munka folytatásakor történik.

- [ ] T10 WHEN a stream `streamIdleSec` ideig csendes THEN a hívás SHALL megszakadni, és a futtató ugyanazokkal az üzenetekkel újrapróbál;
  finish_reason nélküli vég → újrapróba.
- [ ] T11 WHEN a Codex-folyamat él, de a kimenete és a munkamenet-fájl nem nő THEN a burok SHALL leállítani és ugyanabban a munkamenetben
  folytatni; a „tokens used” szóközös tagolású száma helyesen olvasva.
- [ ] T12 WHEN a szívverés régi / a folyamat nem él THEN a `heartbeat.mjs` SHALL ezt kilépési kóddal jelezni, API-hívás nélkül.

## Nem cél

- A közös megbízás-sablon (`vak-ellenor-megbizas.md`) átírása — a szerződés a futtató saját kiegészítésébe kerül.
- Claude Code PreToolUse-hook: a vak ellenőr nem Claude-munkamenet, a „hook” szerepét a futtató gépi őre és a Codex-burok tölti be.
- A leletek tartalmi helyességének gépi eldöntése (a gép a formát és a teljességet ellenőrzi, nem az igazságot).

## Edge case-ek

- A jelentés a zárósor után gépi láblécet kap (a futtató írja) — az ellenőrző a modell szövegét nézi (a lábléc előtt).
- Idézett tiltott fordulat (pl. egy lelet a kód kommentjét idézi kódblokkban) — a kódblokkok (```…```) és a `…` közti szöveg
  kimarad a fordulat-keresésből.
- A „Mit NEM vizsgáltam” szakasz múlt idejű („vizsgáltam”) — nem tiltott; csak a jövő idejű / felajánló alakok tiltottak.
- Nincs lelet: a leletek szakasz lehet „nincs”; ekkor csak a pontok és a szakaszok számítanak.
- finish_reason=length / üres válasz: a meglévő célzott emlékeztető marad; a csonka jelentést az ellenőrző (hiányzó szakasz / zárósor)
  fogja meg.

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] T1 WHEN a jelentés teljes (szakaszok, minden pont ítélettel, minden lelethez forgatókönyv + javaslat, egyező zárósor, tiltott
  fordulat nélkül) THEN az ellenőrző SHALL elfogadni.
- [ ] T2 WHEN a jelentés tervet / megállási vagy felajánló fordulatot tartalmaz THEN SHALL elutasítani a fordulat megnevezésével.
- [ ] T3 WHEN egy lelethez nincs forgatókönyv vagy javaslat, vagy „és így tovább” / „példaként néhány” áll benne THEN SHALL elutasítani.
- [ ] T4 WHEN egy kötelező szakasz vagy egy hibakereső pont hiányzik, vagy a pont sorában nincs ítélet THEN SHALL elutasítani, és a
  hiánylista a pont azonosítóját tartalmazza.
- [ ] T5 WHEN a zárósor hiányzik, vagy a benne állított szám / hiánylista nem egyezik a gépi számítással THEN SHALL elutasítani.
- [ ] T6 WHEN a modell hiányos jelentést ad le THEN a futtató SHALL ugyanabban a beszélgetésben folytatásra küldeni a hiánylistával;
  1. hiányos → 2. teljes → elfogadva; 4 hiányos leadás → NEM TELJES (nem ítélet).
- [ ] T7 WHEN a `record-review` kizárólagos módban teljesség-bizonyíték nélküli vagy hiányos futtató-jelentést kap THEN SHALL elutasítani.
- [ ] T8 WHEN a Codex-burok kimenete hiányos THEN SHALL `codex exec resume <azonosító> -` hívással folytatni (legfeljebb 3-szor);
  azonosító nélkül megállni.
- [ ] T9 Mutációs ellenpróba legalább 4 mutánssal.
