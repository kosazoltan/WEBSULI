# Ellentétes családú tartalék — B szelet: a ma tartalék nélküli hívóhelyek (2026-10-14)

Szülő spec: `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md` (A1+A2: #216). Végrehajtás:
`docs/specs/2026-10-14-tartalek-b-szelet-vegrehajtas.md`.

## Tulajdonosi döntések (2026-10-14)
- „Mindenhova” ellentétes családú tartalék (GPT → Opus 5.5 medium, Claude → GPT-6.1 Sol medium).
- **Ellenőrző szerepek** (bank-ellenőr, vak megoldó, tanári kérés-ellenőrzés): ha a tartalék az ELLENŐRZÖTT tartalom
  családjába esne, a tartalék a harmadik család — Qwen 3.8 Max 0902, high (a lektorral azonos elv).
- **Webes forrásgyűjtés** (Claude web_search/web_fetch eszközök): külön PR, élő forrásgyűjtési méréssel (B4).

## Alszeletek
- **B1 (ez a PR) — Studio támogató hívások**, közös segéddel (`callStepModelWithFallback`):
  - vak megoldó, bank-ellenőr — ellenőrzött tartalom: a bank (`gpt-5.6-luna`, OpenAI) → tartalék: Qwen 0902;
  - tanári kérés pontjai (tervezés előtt, nem ellenőrző) → GPT-6.1 Sol;
  - tanári kérés ellenőrzése (kész lecke) — ellenőrzött: a lecke szerzői (`authorModels`) → Sol, GPT-szerzőnél Qwen;
  - szövegjavító (`TEXT_FIX_MODEL`, író) → Sol; a szerzőlépésben az elfogadott átírás TÉNYLEGES modellje szerző;
  - fogalomjavítás (`fixConceptOnLesson`): szerző → Sol tartalék; a lektor a javítás tényleges szerzője szerinti láncon;
  - webes tartalmi javító (`callTeachingRepair`) és webes bankjavító (`repairCall`) → Sol; a tartalmi javító tényleges
    modellje kerül a webes szerzőlistába;
  - szerkezett javítás (`structured-improvement`): szerző/tervező → tartalék; a lektor a tényleges szerző szerinti láncon.
- **B2** — tantárgy/évfolyam-felismerés (`callScopeModel`) és kivonatoló (extract): OpenAI → Opus 5.5 (képolvasás
  Anthropic-úton). Külön PR.
- **B3** — adminisztrációs útvonalak (htmlFix, htmlTheme, claudeChat, chatgptChat, claudeHtml, analyzeFiles,
  htmlFixStream), HTML-modernizálás (`improve`: terra → gpt-6.1-sol, medium), kvízgenerátor. Streamnél a váltás CSAK az első
  kiküldött darab előtt (utána a félkész válasz nem cserélhető). Külön PR.
- **B4** — webes forrásgyűjtés GPT-6.1 Sol + OpenAI webes keresővel, élő méréssel. Külön PR.

## Szabály (B1)
- `independentFallbackFor(model, checkedModels)`: `crossFamilyFallback(model)`; ha ennek családja az ellenőrzött modellek
  családjai között van → `LEKTOR_THIRD_FAMILY_MODEL` (ha az sem ütközik), különben nincs tartalék.
- A tartalék csak `StepModelError`-ra (szolgáltatói / kimeneti hiba), megszakítás nélkül, és csak kulccsal indul.
- Effort: ellentétes családú tartalék medium; a Qwen tartalék high (`MODEL_REASONING_EFFORT`).
- A fail-open szerepek (vak megoldó, bank-ellenőr, pontjegyzék, kérés-ellenőrzés, szövegjavító) hibája a tartalék
  bukása után is csak kimaradás — a gyártás nem áll meg (változatlan).

## Nem cél
- A2-ben már lefedett lépések; OCR-fúzió (két család, kölcsönös); katalógus-besoroló (konszenzus); nem OpenAI/Anthropic
  elsődlegesek (orkesztrátor, témafókusz, gateHelper).

## Elfogadás (EARS)
- **E1** WHEN egy B1 hívóhely elsődleges hívása `StepModelError`-ral bukik, THE rendszer SHALL egyszer a tartalékon
  próbálkozni `{ fallback: true }`-val.
- **E2** WHEN a hívás ellenőrző, és a tartalék az ellenőrzött tartalom családjába esne, THE tartalék SHALL Qwen 0902 lenni.
- **E3** THE lektor (fogalomjavítás, szerkezett javítás) SHALL NOT a javítás tényleges szerzőjének családjából futni.
- **E4** `check`, `check:test`, `lint`, `test`, `build` zöld.
