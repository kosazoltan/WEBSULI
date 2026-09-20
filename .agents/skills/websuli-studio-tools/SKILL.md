---
name: websuli-studio-tools
description: A Studio determinisztikus eszközei (outline-autofix, bank-packet-autofix, section-visuals) — mikor futnak a pipeline-ban, hogyan futtathatók kézzel, mit javítanak és mit nem. Aktiválódjon bankcsomag-hiba, vázlat-hiba, hiányzó ábra vagy modellhívás-költség vizsgálatakor.
---

# Studio eszközök — modellhívás helyett kód

Cél (tulajdonosi döntés 2026-09-19): a formai hibákat és a sablonos munkát determinisztikus szkript végezze, a fizetett modellkör csak tartalmi hibára maradjon. Az eszközök forrása és a szerep-skillekbe írt leírásuk egy helyen él: `source/server/studio/role-skills.ts` (`TOOL_SKILLS`, `ROLE_TOOLS`).

## Az eszközök

| Eszköz | Fájl | Hol fut automatikusan | Kézi futtatás |
| --- | --- | --- | --- |
| outline-autofix | `server/studio/tools/outline-autofix.ts` | pedagógus lépés, `outlineSchema` előtt | `npm run studio:tool -- outline-autofix vazlat.json terkep.json` |
| bank-packet-autofix | `server/studio/tools/bank-packet-autofix.ts` | minden bankcsomag-válasz után, a séma előtt (`experience-builder`) | `npm run studio:tool -- bank-packet-autofix csomag.json 0 c1,c2` |
| section-visuals | `server/studio/section-visuals.ts` | animátor lépés: ha minden fejezet kap ábrát, NINCS modellhívás (`model = tool:section-visuals`); különben a modell után pótol | `npm run studio:tool -- section-visuals lecke.json` |
| arithmetic-claims | `server/studio/tools/arithmetic-claims.ts` | minden bankcsomag-válasz után: a hamis „a · b = c” állítás (magyarázat, minta, kérdés) javító kört kap a lektor előtt | `npm run studio:tool -- arithmetic-claims csomag.json` |
| section-patch (célzott szerzői javítás) | `server/studio/section-patch.ts` | szerzői javító kör: ha minden tanítási kifogás fejezethez köthető, a szerző csak azokat kapja vissza `{ "sections": { "<index>": … } }` alakban, a runner egyesíti; a többi fejezet bájtra azonos → a bankcsomagja újrahasznosul | nincs CLI (pipeline-belső) |

A `terkep.json` lehet `{ "concepts": [{ "localId": … }] }` vagy egy `localId`-s tömb. A kimenet JSON: `fixes` (mit változtatott) és `result` (a javított objektum); `section-visuals` esetén `modelCallNeeded` mutatja, kellene-e még modell.

## Helyes alkalmazás

1. **Diagnózis:** ha egy futás javító körben ragad (`studio_jobs.error`, workflow-napló `validation_failure`), előbb futtasd az eszközt a mentett csomagra/vázlatra: ha a `fixes` lista üres és a hiba marad, TARTALMI hiba — a prompt/skill javítandó, nem az eszköz.
2. **Új formai hibaosztály:** csak akkor kerül az eszközbe, ha (a) determinisztikusan javítható, (b) nem talál ki tartalmat, (c) van rá teszt a `tests/studio-tools.test.ts`-ben mért példával. Tartalmi hiba sosem kerül eszközbe.
3. **Skill-szinkron:** az eszköz viselkedésének változásakor a `TOOL_SKILLS` szövegét is frissítsd — a modellek ebből tudják, mit garantál a kód. A skill-verzió a hashek része, ezért a régi cache nem használódik újra.
4. **Mérés:** az eszköz hasznát a workflow-naplóban a bank-mentőkörök és javító körök számának csökkenésén mérd, nem érzésre.

## Ne tedd

- Ne engedd, hogy az eszköz hiányzó tételt, megoldást vagy fogalmat „pótoljon" — az D1-sértés.
- Ne futtasd az eszközt a kapu (gate) megkerülésére: a kapu és a lektor változatlanul fut az eszköz kimenetére is.
- Ne írj új CLI-t; bővítsd a `scripts/studio-tool.ts` kapcsolóit.
