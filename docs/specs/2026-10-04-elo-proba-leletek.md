# Élő próba leletei — 3 determinisztikus hiba (2026-10-04)

Forrás: a tulajdonos által engedélyezett élő próba (run 69cacab5, job bce352a5, „Negatív számok kivonása”, map 64f93bca,
main f8f5fde) naplója. Mindhárom hiba determinisztikus kódhiba, nem modellhiba.

## 0. (FŐ GYÖKÉROK) A megalapozottság-ellenőrzés a képlet-fogalmakat sosem látja megalapozottnak
- Mért (ingyenes visszajátszás az éles leckéken): job bce352a5 — 52 megalapozatlan címkéből 50 képlet-fogalom (`5+(+8)`,
  `9-(-6)` …), a blokk szövege pedig szó szerint tartalmazza őket („Számold ki: 5+(+8)! 5+(+8)=+13”); a tegnapi bukott job
  3b4b165c — 74/74 képlet-fogalom. A kapu ezért célzott szerzői javítást kért (tegnap ebből indult a bukási lánc: új bank →
  9 hiba → holtzóna), a limit-elfogadás pedig core 10% / supporting 25% mellett biztosan bukott volna (40 blokk kivétele).
- Ok: `server/studio/grounding.ts` `checkGrounding` — `significantWords` a ≥3 karakteres szavakat tartja; a képlet szavai
  („5”, „8”) rövidek, a lista üres, és a függvény AZONNAL `false`-t ad, a definíció- és idézet-alapú tartalékig sem jut el.
- Cél: képlet-fogalomnál (számjegy van, érdemi szó nincs) a blokk a kifejezést előjel-pontosan tartalmazza (szóköz- és
  mínuszjel-normalizálva, számhatárral: a `9-(+6)` nem alapozza meg a `9-(-6)`-ot). Képlet-fogalomnál CSAK ez dönt:
  az idézet-számok tartaléka előjel-vak, a testvér-definíciók szinte azonosak. Szöveges fogalomnál a viselkedés változatlan.
- Élő próba: run 69cacab5 a kapu után leállítva (determinisztikus bukás, nincs pénzégetés); job/workflow hibával lezárva.

## 1. A típusos referencia nem fogadja el a pozitív előjelet
- Mért: „tasks: t9-01: a(z) végpont rész referenciaértéke („+3”) nem értelmezhető.” (10. fejezet, 1. kísérlet).
- Ok: `shared/answer-value.ts` `parseReferenceExpression` — az egyoperandusú mínusz kezelt, a plusz nem.
- Cél: `+a`, `+(…)`, `(+a)` a kifejezésnyelv része; értéke az operandus.

## 2. A prompt-lenyomat csak a névvel kulcsolt
- Mért: „Az utasítás megváltozott folytatáskor (…, studio.animator.section.v1 / studio.animator.v1 / studio.lektor.v1)” minden új
  fejezetnél és körnél — nincs valódi sablonváltozás.
- Ok: `server/studio/step-runner.ts` `workflowNotePromptHash(name, …)`; a review #158 dokumentált szándéka (engine.ts komment):
  „hívásonként (név + kör)”.
- Cél: kulcs = `név#lépés:kör[:fejezet:változat]`; ugyanaz a hívás eltérő utasítással továbbra is jelez.

## 3. A forrás-helyesbítés auditja „undefined”-ot ír újraindításkor
- Mért: „definíció: „undefined” → „A helyes eredmény: …””.
- Ok: a már érvényben lévő helyesbítésnek nincs régi alakja (review #181: `from` üres), az audit ezt nem kezelte.
- Cél: „(már helyesbítve)”.

## Nem-cél
A bankcsomagok egyéb bukott kísérletei (mintaválasz nem teljes pont) — a célzott próbák szerint a pontozó helyesen ítél, adat
nélkül nem állítunk kódhibát. A `referenceValueProblems` zárójeles kérdést továbbra sem ítél meg (dokumentált; a bank-ellenőr dolga).

## Elfogadás (EARS)
- `referenceValue("+3") = 3`, `referenceValue("+(-6)") = -6`, `referenceValue("(+3)") = 3`; a „+3” referenciájú helyes válasz teljes pont.
- Két különböző fejezet/kör lenyomata nem jelez; ugyanazé eltérő szöveggel jelez.
- Újraindításkor az audit nem tartalmaz „undefined”-ot.
- A képlet-fogalom akkor megalapozott, ha a blokk előjel-pontosan tartalmazza; a `9-(+6)` blokk nem alapozza meg a `9-(-6)`
  fogalmat; szöveges fogalom változatlan. Az éles visszajátszás (bce352a5, 3b4b165c) a javítás után nem mutat hamis
  képlet-leletet.
- Minden új teszt a javítás nélkül bukik; teljes unit, tsc, lint zöld.
