# Újraindulás utáni folytatás a mentett részekből — terv (2026-10-15)

## Tulajdonosi hibajelzés (2026-10-15)
„A szerver 3× leállt (valószínűleg a merge/deploy miatt), és a tananyaggyártás mindig elölről kezdődik, mintha nem került volna mentésre az
addig elkészült munka; nincs draft szakaszonként. Ellenőrizd a futásokból!”

## Mért tények (csak olvasás, 2026-10-15 délután, ugyanaz a forrás: térkép 3f39ab9b)
| job | workflow-útvonal | állapot |
|---|---|---|
| a20403d4 | … pedagogue:done > author:done > animator:running | run `interrupted` → job lezárva „A szerver újraindult…” |
| 9262d9ba | … author:done > animator:error > animator:done > lektor:done > author:done > animator:error | bankjavítás: „q-new-40: a lektor által nem érintett tétel nem módosítható” → lezárva |
| 7c89c550 | … author:done > animator:running | run `interrupted` → lezárva „A szerver újraindult…” |
| 84fe2219 | … animator:done > lektor:done > animator:running | run `interrupted`, a job **örökre `running`** |
| 441866e2 | … animator:error | bankjavítás: „t3-task-12: a javítási jogosultságon kívüli tétel nem módosítható” |
A tanítás (`lessons` sor) és a kész bankcsomagok (`experienceCheckpoint`, 2–3 rész) **el voltak mentve** — a program nem folytatta őket.

## Gyökérokok (kódból)
1. `server/studio/orphan-jobs.ts` `sweepDecision`: csak `runState === "running"` esetén folytat; a halott folyamat futása a tárban
   `interrupted` (`server/workflows/store.ts`: running + lejárt lízing → interrupted) → induláskor **lezárás**, futás közben **örök `leave`**.
2. `resumeKindOf` (`step-runner.ts`): az `ORPHAN_JOB_ERROR` („A szerver újraindult…”) nem folytatható hiba → a vezérlő sem veszi fel.
3. `server/index.ts` `gracefulShutdown`: a DB-kapcsolat lezárul, miközben lépés fut → a lépés hibára futhat és hibaként rögzülhet.
4. Új gyártás ugyanabból a forrásból mindig új jobot indít, a félbemaradt piszkozatot nem folytatja.
5. `applyBankPacketRepair` (`experience-builder.ts`): a jogosultságon kívüli tétel változása az EGÉSZ javítást elveti → a csomag elbukik.
6. `redactWorkflowError` (`server/workflows/engine.ts`): a `sk-` minta szó közepén is illeszkedik („t3-task-12” → „t3-ta[titkos érték]”).

## Cél
Szerver-újraindulás után a félbemaradt gyártás **magától, a mentett részekből** folytatódik (tanítás, kész bankcsomagok megmaradnak);
új gyártás ugyanabból a forrásból a megszakadt piszkozatot folytatja; a bankjavítás nem bukik el egy jogosulatlan mellékváltozáson.

## Nem-cél
- A valódi (nem újraindulás-eredetű) hibák viselkedése nem változik — azokat a vezérlő a meglévő lépcsője szerint kezeli.
- Publikált lecke nem nyúlik.

## Elfogadás (EARS)
- E1: HA a futás `interrupted` / lejárt lízingű `running`, a job nem végleges és a végrehajtási keret engedi, AKKOR a söprés folytatja (induláskor és később is).
- E2: HA egy job „A szerver újraindult…” hibával áll, mentett leckével, nem publikált, és ugyanabból a forrásból nincs újabb job, AKKOR a vezérlő a megszakadt lépéstől folytatja.
- E3: HA a szerver leáll, AKKOR a leállás alatt megszakadt lépés nem rögzül hibaként (a futás `interrupted` marad, folytatható).
- E4: HA ugyanabból a forrásból új gyártás indul, és van megszakadt (újraindulás miatt álló vagy gazdátlan) piszkozat, AKKOR azt folytatja új job helyett.
- E5: A jogosultságon kívüli tétel változása figyelmen kívül marad (a tétel az eredeti), a jogos változás érvényes; napló.
- E6: A titok-kitakarás szó közepén nem illeszkedik („task-12” érintetlen; „sk-abc…” kitakarva).
