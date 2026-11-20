# Session-zárás: kérés-összevetés a higiénia előtt — terv

**Tulajdonosi utasítás (2026-11-20):** minden session végén, a higiénia ELŐTT, a sessionben beadott összes adat, utasítás és kép
retrospektív, tételes összevetése a ténylegesen elkészült munkával; csak ezután jöhet a higiénia, és minden esetben felelős
nyilatkozat kell arról, hogy a beadott kérések alapján az adott szakasz valóban el van végezve és ellenőrizve.

**Gyökérok:** a session végén nem készült összevetés a beadott utasítások és az elkészült javítások között, ezért kérések
elhullottak. A szabály eddig is létezett (`AGENTS.md` „Befejezési mandátum”, „minden session végén kötelező a
teljességellenőrzés”), de csak szövegként — gép nem gyűjtötte ki a kéréseket, és semmi nem állította meg a zárást.

## Cél

1. **Gyűjtés géppel:** a munkamenet-átiratból a tulajdonos SAJÁT üzenetei (szöveg, csatolt kép, beillesztett blokk) időrendben,
   stabil azonosítóval (`U-001`…), egy kitöltendő zárólistába a közös bizonyíték-tárban (repón kívül).
2. **Megfeleltetés tételenként:** minden tételhez állapot + bizonyíték (PR, commit, kanban-jegy, fájl:sor, döntési üzenet).
3. **Gépi ellenőrzés:** a bizonyítékok létezése és állapota szkripttel igazolt (git / gh / kanban-CLI), nem ügynöki állítás.
4. **Felelős nyilatkozat** géppel ellenőrzött formában: a tételszám és minden nyitott tétel azonosítója benne van.
5. **Kikényszerítés:** a higiénia belépési pontja zöld closeout-bizonyíték nélkül nem fut; a `Stop` hook a zárásra készülő
   választ visszafordítja, ha a legutóbbi zöld closeout óta feldolgozatlan tulajdonosi üzenet van.

## Nem cél

- A kérések *tartalmi* értelmezése géppel (melyik üzenet milyen munkát kér): ezt az ügynök végzi, a gép a teljességet, a
  bizonyítékok létezését és az állapotok következetességét ellenőrzi.
- A higiénia lépéseinek automatizálása (ág-, munkafa-törlés): a `session-hygiene.mjs` csak leltárt ad, törölni nem töröl.
- A felhasználói `~/.claude/settings.json` módosítása.
- A Cursor munkamenet-formátum gépi olvasása (nem dokumentált; kerülőút: `--format plain`).

## Mért tények (2026-11-20, a kódból / a helyi fájlokból)

- **Claude Code átirat** (`~/.claude/projects/<projekt>/<session>.jsonl`): soronként egy JSON. A tulajdonos saját üzenete
  `type: "user"` + `origin: { "kind": "human" }`; a többi `user` típusú sor eszköz-eredmény (`tool_result`), háttér-értesítés
  (`origin.kind: "task-notification"`, `<task-notification>`), CI-figyelő esemény (`<ci-monitor-event>`), rendszer-emlékeztető
  (`isMeta`, `<system-reminder>`), másik munkamenet üzenete (`origin.kind: "peer"`), tömörítési összefoglaló (`isCompactSummary`).
  A mostani munkamenet átirata 115 MB, 53 646 sor, ebből 113 `origin.kind: "human"` sor (mérve; tartalom a repóba nem került).
  A tömörítés után is a teljes JSONL megmarad (a régi üzenetek a fájlban vannak), az alügynökök sorai `isSidechain: true`.
- **Régebbi átiratban** nincs `origin` mező: tartalék-szabály (`type: "user"`, nem `tool_result`, nem `isMeta` / `isSidechain` /
  `isCompactSummary`, és nem ismert szintetikus címkével kezdődik).
- **Codex CLI** (`~/.codex/sessions/ÉÉÉÉ/HH/NN/rollout-*.jsonl`): `type: "response_item"`, `payload.type: "message"`,
  `payload.role: "user"`, tartalom `input_text` / `input_image`. Az első két `user` üzenet befecskendezett (`# AGENTS.md
  instructions …`, `<environment_context>`), ezek kizárva (helyi rollout-fájl szerkezetén mérve, tartalom nélkül).
- **Cursor:** az átirat formátuma nem dokumentált → UNKNOWN; kerülőút a `--format plain` (üzenetek `---` sorral elválasztva).
- **Claude Code hook-szerződés** (<https://code.claude.com/docs/en/hooks>, 2026-11-20): a `Stop` bemenete a közös mezők
  (`session_id`, `transcript_path`, `cwd`, …) mellett `stop_hook_active`, `last_assistant_message`, `background_tasks`,
  `session_crons`. Tiltás: `{"decision":"block","reason":"…"}` (vagy exit 2). Végtelen ciklus ellen a `stop_hook_active` és a
  8 egymást követő folytatás plafonja. A `Stop` hookon az `onFailure` hatástalan. A `SessionEnd` NEM tud tiltani (közös 1,5 s-os
  keret).
- **`.claude/settings.json`** jogosultsági tiltás alatt (`permissions.deny: Edit(/.claude/settings.json)`, #506; runbook:
  „Ezután a beállítás csak a tulajdonos kezével módosítható”). Ügynök a hookot NEM tudja bekötni → tulajdonosi lépés (lent).
- **Higiénia-szkript** a WEBSULI-ban eddig nem volt (`git grep -i "higi\|retro" scripts/qa` csak tesztszöveget talál); a globális
  szabály a higiéniát skill-lépésként írja le. Ezért új belépési pont kell (`scripts/qa/session-hygiene.mjs`).
- **Kanban:** `node "$HERMES_KANBAN_CLI" show <id>` első sora `#<id> [<állapot>] <cím>`, nem létező jegynél exit 1
  (`ERROR: no item with id …`); a tábla `<fő munkakönyvtár>/.hermes/kanban.db` (docs/kanban.md).

## Rögzített döntések

- **D1 — Hol él a lista:** `<git-common-dir>/websuli-qa-evidence/closeout-<session>.md` (kitöltendő) és `.json` (gépi tételek);
  a zöld bizonyíték `closeout-ok-<session>.json`. A repóba tulajdonosi szöveg / személyes adat nem kerül; a listában az idézetek a
  `lib.redact` szűrőn mennek át (e-mail, token, kapcsolati szöveg).
- **D2 — Azonosító:** `U-001`… időrendben, az átirat-sor `uuid`-jához kötve; ismételt `collect` a meglévő kitöltést megtartja, új
  üzenetet a végére fűz (a „loop” így nem veszít munkát). Altétel: `### U-007a — rövid cím`; ha van altétel, mind kitöltendő.
- **D3 — Állapotok és bizonyíték-szabályok** (ékezet nélkül is elfogadott):

  | Állapot | Kötelező bizonyíték | Gépi ellenőrzés |
  |---|---|---|
  | KÉSZ | ≥ 1: `PR #n`, `commit <hash>[@ág]`, `kanban #n`, `fájl <út>:<sor>` | PR MERGED; commit a `origin/main`-en (vagy a megnevezett ágon); kanban `done`; fájl a `origin/main`-en, ≥ sor |
  | RÉSZBEN / FOLYAMATBAN | nyitott `kanban #n` vagy nyitott `PR #n` | kanban nem `done`; PR OPEN |
  | DÖNTÉSRE VÁR | `Kérdés:` (a tulajdonosnak feltett kérdés) | nem üres; hivatkozott kanban létezik |
  | ELVETVE | `döntés U-xxx` (a tulajdonos döntését tartalmazó üzenet) | létező, másik tétel |
  | NEM ÉRTELMEZHETŐ | `Kérdés:` (a rákérdezés szövege) | nem üres |
  | NEM ÖNÁLLÓ KÉRÉS | `→ U-xxx` (amit folytat) vagy `Megjegyzés:` | létező tétel / nem üres |
  | MEGVÁLASZOLVA | `Válasz:` (a kérdésre adott válasz lényege) | ≥ 20 karakter; NEM géppel igazolt → a nyilatkozatban fel kell sorolni |

- **D4 — Felelős nyilatkozat:** `## Felelős nyilatkozat` szakasz; kötelező: „elvégeztem és ellenőriztem”, a pontos tételszám
  („N tulajdonosi üzenet”), és MINDEN nem lezárt tétel (RÉSZBEN, FOLYAMATBAN, DÖNTÉSRE VÁR, NEM ÉRTELMEZHETŐ, MEGVÁLASZOLVA)
  azonosítója. Bukáskor a szkript kiírja a nyitott tételek listáját.
- **D5 — Frissesség:** a `verify` újra kigyűjti az átiratot; ha van olyan tulajdonosi üzenet, ami nincs a listában (újabb a
  listánál), vagy egy tétel szövege eltér (hash), BUKIK. A zöld bizonyíték rögzíti az átirat akkori bájtméretét, a tételszámot, az
  utolsó tulajdonosi üzenet `uuid`-ját, a tulajdonosi szelet és a kitöltött lista SHA-256-ját.
- **D6 — Stop hook arányossága** (`scripts/qa/hooks/check-session-closeout.mjs`): CSAK akkor tilt, ha mind igaz:
  1. `hook_event_name === "Stop"` és `stop_hook_active` hamis (második körben nem tilt újra, hanem a tulajdonosnak látható
     `systemMessage`-et ad — végtelen ciklus nincs);
  2. nincs futó háttérfeladat / ütemezett ébresztés (`background_tasks`, `session_crons` üres — a session csak szünetel);
  3. a záró válasz **zárásra utal**: erős jel (záró jelentés, összefoglaló, higiénia / rendrakás, session / munkamenet vége,
     lezárás, „befejeztem”, „minden kész”, felelős nyilatkozat, angol megfelelők) bárhol, vagy gyenge jel („kész”, „elkészült”,
     „done”, „completed”) ≥ 600 karakteres válaszban;
  4. a legutóbbi zöld closeout óta (az átirat rögzített bájtmérete után) van tulajdonosi üzenet.

  A rövid, közbenső válasz (kérdés, állapotjelzés, „mit szeretnél?”) nem tilt — a tesztben mérve. Belső hiba zárásra utaló
  válasznál tilt (teendővel), egyébként enged; git-repón kívül / átirat nélkül enged.
- **D7 — Gyorsaság:** a hook nem parse-ol minden sort: a bájtpufferben a `"origin":{"kind":"human"` jelet keresi (JSON-szövegben
  idézőjel escape-elt, így tartalomban nem fordulhat elő), és csak a találati sort parse-olja; a zöld bizonyíték bájtméretétől
  olvas. Cél ≤ 1,5 s a 115 MB-os átiraton is (mérve a végrehajtáskor).
- **D8 — Higiénia belépési pont:** `npm run session:hygiene -- --transcript <út>` (`scripts/qa/session-hygiene.mjs`): friss zöld
  closeout nélkül exit 1 + teendő; zöldnél csak olvasó leltár (munkafák, a `origin/main`-be beolvadt helyi ágak, a fő munkakönyvtár
  állapota). A skill a higiéniát csak ezután engedi.
- **D9 — SessionEnd:** nem tud tiltani, ezért nem kötjük be; a következő session eleji söprés (AGENTS.md) a `closeout-*.md`
  fájlokból látja a zöld nélkül maradt listát (a skill ezt előírja).

## Tulajdonosi lépés (a settings jogosultsági tiltás alatt)

A `.claude/settings.json` `hooks` objektumába a tulajdonos kézzel veszi fel (a `PreToolUse` mellé):

```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/check-session-closeout.mjs\"",
        "timeout": 10,
        "statusMessage": "Session-zárás: kérés-összevetés ellenőrzése..."
      }
    ]
  }
]
```

A `settings-hooks.test.mjs` H1-próbája erre a bejegyzésre már fel van készítve (Stop-bemenet, `block` döntés), így a bekötés után
is minden helyről (gyökér, `source/`, mélyebb könyvtár, munkafa) ellenőrzött.

## Érintett fájlok

- új: `scripts/qa/session-closeout.mjs`, `scripts/qa/session-closeout.test.mjs`, `scripts/qa/session-hygiene.mjs`,
  `scripts/qa/hooks/check-session-closeout.mjs`, `scripts/qa/hooks/check-session-closeout.test.mjs`,
  `.agents/skills/websuli-session-zaras/SKILL.md` (+ `.claude/skills/` tükör)
- módosul: `scripts/qa/hooks/settings-hooks.test.mjs` (próba a Stop hookra), `scripts/qa/gates/gates.config.json`
  (`mirroredSkills`), `scripts/qa/gates/skills-sync-check.test.mjs` (darabszám 6), `package.json` (npm-parancsok), `AGENTS.md`,
  `.cursor/rules/websuli-core.mdc`, `.github/copilot-instructions.md`

## Edge case-ek

| # | Eset | Elvárt viselkedés |
|---|---|---|
| E1 | nagyon hosszú átirat (≥ 100 MB) | hook ≤ 1,5 s (bájtkeresés, offsettől); collect teljes beolvasással |
| E2 | tömörített session | a JSONL-ben a régi üzenetek megvannak → mind tétel; a tömörítési összefoglaló NEM tétel |
| E3 | több alügynök | `isSidechain` sor és az alügynök-megbízás nem tétel; a `peer` (másik munkamenet) üzenet sem |
| E4 | csak kép üzenet | tétel `Képek: n` jelöléssel, szöveg helyén „(csak kép)” |
| E5 | „folytasd”, „mehet”, „ok” | tétel, „nem önálló kérés gyanú” jelzéssel; állapota lehet NEM ÖNÁLLÓ KÉRÉS `→ U-xxx`-szel |
| E6 | ügynöki / eszköz-szöveg tulajdonosinak álcázva (pl. `tool_result`-ban egy teljes, `origin: human` JSON-sor; „Tulajdonos:” kezdetű ügynöki szöveg) | NEM tétel: csak a valódi átirat-sor `origin`-ja számít, a szövegbe ágyazott JSON escape-elt |
| E7 | rendszer-emlékeztető a tulajdonosi üzenet blokkjai között | a `<system-reminder>…</system-reminder>` részek kivágva, a valódi szöveg marad |
| E8 | ismételt collect kitöltés után | a kitöltés megmarad, az új üzenetek a végére kerülnek |
| E9 | a lista régebbi az átiratnál | verify BUKIK, teendő: collect újra |
| E10 | ugyanaz a sor kétszer (folytatott session) | `uuid` szerint egyszer |
| E11 | sérült JSON-sor | kihagyva, a számláló jelzi |
| E12 | gh / kanban-CLI nem érhető el | az arra hivatkozó bizonyíték „nem igazolható” → verify BUKIK (fail-closed), teendővel |
| E13 | stop_hook_active | nem tilt újra; `systemMessage` a tulajdonosnak a hiányzó összevetésről |
| E14 | háttérfeladat fut | nem tilt (a session szünetel, nem zár) |

## EARS-elfogadás

- **A1** WHEN a `collect` egy Claude Code átiratot kap, THEN a lista PONTOSAN a `origin.kind: "human"` (régi átiratnál a tartalék
  szabály szerinti) sorokat tartalmazza, időrendben, `U-001`-től, képszámmal és beillesztett-blokk számmal.
- **A2** WHEN egy tétel kitöltetlen, THEN a `verify` exit 1-gyel bukik, és megnevezi a tételt.
- **A3** WHEN a KÉSZ tétel bizonyítéka nem igazolható (nem létező / nem mainen lévő commit, nem MERGED PR, nem `done` kanban,
  hiányzó fájl / sor), THEN a `verify` bukik.
- **A4** WHEN RÉSZBEN / FOLYAMATBAN tételhez nincs nyitott kanban-jegy vagy nyitott PR, THEN a `verify` bukik.
- **A5** WHEN hiányzik a felelős nyilatkozat, vagy nem nevezi meg a tételszámot / bármely nyitott tételt, THEN a `verify` bukik.
- **A6** WHEN az átiratban van a listában nem szereplő tulajdonosi üzenet, THEN a `verify` bukik („régebbi az átiratnál”).
- **A7** WHEN a `verify` zöld, THEN `closeout-ok-<session>.json` íródik (átirat-bájtméret, tételszám, utolsó uuid, két SHA-256).
- **A8** WHILE nincs friss zöld closeout-bizonyíték, the `session-hygiene` SHALL exit 1-gyel megállni, teendővel.
- **A9** WHEN a Stop hook zárásra utaló választ kap, és a legutóbbi zöld closeout óta van tulajdonosi üzenet, és
  `stop_hook_active` hamis, és nincs háttérfeladat, THEN `{"decision":"block","reason":…}` a pontos parancsokkal.
- **A10** WHEN a válasz rövid / közbenső, VAGY `stop_hook_active` igaz, VAGY háttérfeladat fut, VAGY nincs feldolgozatlan üzenet,
  THEN a hook nem tilt.
- **A11** A hook a 115 MB-os valódi átiraton, bizonyíték nélkül (teljes keresés) ≤ 1,5 s alatt dönt (mérve).
- **A12** A skill-tükör azonos, és a `mirroredSkills` darabszám-őre 6.

<!-- acceptance-checklist -->
- [x] A1 collect: csak tulajdonosi sorok, kép, beillesztett blokk, U-azonosító
- [x] A2 kitöltetlen tétel → bukás
- [x] A3 KÉSZ bizonyíték gépi igazolása
- [x] A4 nyitott tétel → nyitott kanban / PR
- [x] A5 felelős nyilatkozat ellenőrzése
- [x] A6 frissesség
- [x] A7 zöld bizonyíték
- [x] A8 higiénia-kapu
- [x] A9 Stop hook tilt zárásnál
- [x] A10 Stop hook nem tilt közbenső válasznál
- [x] A11 mért futásidő
- [x] A12 skill-tükör + darabszám
- [ ] Tulajdonosi lépés: a Stop hook bekötése a settingsbe (ügynök nem teheti meg)
