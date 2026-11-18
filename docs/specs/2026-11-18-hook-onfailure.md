# A kapu-hook hibája / időtúllépése = tiltás (`onFailure: "block"`) + az audit-hook fail-closed időtúllépése

- Dátum: 2026-11-18
- Kanban: #100 (a hook hibája = tiltás), #126 (A7: `check-audit-ok`)
- Tulajdonosi döntés (2026-11-18): **IGEN, tiltson** — a kapu-hook saját hibája / időtúllépése is tiltás legyen.
- Előzmény: `docs/specs/2026-11-17-kulso-ellenor.md` 11.1 (2) pont; a korábbi, jóváhagyásra váró commit (`f1395360`, ág
  `chore/hook-onfailure-block`) tartalma ide kerül, a friss mainre építve.

## Cél

1. A `.claude/settings.json` kapu-hook bejegyzésein (Bash és PowerShell) `"onFailure": "block"`: ha maga a hook-folyamat nem indul,
   összeomlik, túllépi a 60 s-os külső korlátot vagy érvénytelen kimenetet ad, a Claude Code a parancsot TILTJA (a hivatalos
   hooks-dokumentáció szerint v2.1.295-től; a gépen futó Claude Code 2.1.325).
2. A kapu-hook saját „nem válaszolt” tiltása (időtúllépés, indítási hiba) megmondja a teendőt: néhány másodperc múlva ugyanaz az
   egyszerű parancs újra; ha tartós, a runbook szakaszára mutat.
3. A7: a `check-audit-ok` hook a git időtúllépésekor / indítási hibájakor és belső hibájakor a push-parancsra **tilt** (eddig
   átengedett); a gyors, nem nulla kilépés (nem git-repó) továbbra sem az ő dolga. Ezzel a `settings-hooks.test.mjs` terhelt gépen sem
   ingadozik (a várt döntés tiltás).
4. Runbook: elromlott hook-szkriptnél az ügynök KIZÁRÓLAG a hookot javíthatja (Edit / Write eszközzel, azon nincs `onFailure`,
   teszttel); a védelmet nem távolíthatja el, nem gyengítheti és kerülőútként sem javasolhatja. Ha a javításhoz nincs
   futtatókörnyezet, vagy az csak a tiltott úton menne: megáll, és a tulajdonostól kér segítséget. A védelem ideiglenes
   kikapcsolása (pl. `disableAllHooks`) kizárólag a tulajdonos saját kezű lépése (Codex P1, #506).

## Nem cél

- A többi hook (`check-destructive`, `enforce-repo-rules`, `warn-test-edit`) `onFailure`-e — minden parancsra futnak, a hibájuk
  minden munkát megállítana; külön döntés.
- A tokenizáló (#499) — külön PR.

## Érintett fájlok

`.claude/settings.json`, `scripts/qa/hooks/check-quality-gates.mjs` (üzenet), `scripts/qa/hooks/check-audit-ok.mjs`,
`scripts/qa/hooks/hook-failure.test.mjs` (új), `docs/minosegkapuk.md`, ez a terv és a végrehajtási fájl.

## Edge case-ek

- A `check-audit-ok` a `.agentic-qa-kit` kezelt fájlja: egy kitfrissítés felülírhatja — a teszt ezt jelezné (fail-closed elvárás).
- Nem push parancs → az audit-hook semmit nem vizsgál (változatlan).
- Nem git-repó (gyors, nem nulla kilépés) → enged (változatlan).
- Elromlott kapu-hook szkript (`onFailure: block`) → minden Bash / PowerShell parancs tiltott; az Edit / Write eszközön nincs
  `onFailure`, azzal a HOOK javítható (a védelem eltávolítása nem út — lásd 4. pont).

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] F1 WHEN a kapu-hook bejegyzését (Bash, PowerShell) a settings-ben vizsgáljuk THEN mindkettőn SHALL `"onFailure": "block"` lenni
  (a többi hook-bejegyzésen nem).
- [ ] F2 WHEN a kapu-hook nem kap választ a git-től a keretén belül THEN the hook folyamata SHALL tiltani, és az üzenet SHALL
  megmondani a teendőt (újrapróbálás; tartós hibánál a runbook szakasza).
- [ ] F3 WHEN a `check-audit-ok` push-parancsnál a git-et nem tudja elindítani / időtúllép THEN SHALL tiltani, teendővel.
- [ ] F4 WHEN a `check-audit-ok` nem push parancsot kap, vagy nem git-repóban fut THEN SHALL engedni (változatlan).
- [ ] F5 WHEN a runbookot olvassuk THEN SHALL kimondani: elromlott kapu-hooknál az ügynök csak a hookot javíthatja; a védelem
  eltávolítását nem végezheti és nem javasolhatja; ha nem tudja javítani, megáll és a tulajdonostól kér segítséget; a kikapcsolás
  kizárólag a tulajdonos lépése. A runbook szakasza nem tartalmazhat ügynöknek szóló eltávolítási utasítást (szöveg-őr teszt).
- [ ] F6 (visszaellenőrzés, 2026-11-18) WHEN a hook-bemenet nem értelmezhető JSON, de a nyers szövegben kapu-köteles művelet van THEN
  mindkét hook SHALL tiltani (enélkül, és üres bemenetnél enged).
- [ ] F7 WHEN az audit-hook git-hívása fut THEN a korlátja SHALL 10 s lenni (csak `node --test` alatt felülírható, felülről
  korlátozva); a belső hiba ága, a valódi időtúllépés és a kapu-hook keret-üzenetének teendője teszttel fedett.
