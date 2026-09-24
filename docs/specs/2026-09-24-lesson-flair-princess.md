# Változatos, figyelemfelkeltő megjelenés: „Hercegnő-kastély” világ + lecke-szintű különlegességek

Dátum: 2026-09-24 · Tulajdonosi kérés (egy 5. osztályos kislány édesanyjának visszajelzése nyomán) · Ág: `feat/lesson-flair-princess`

## Cél
1. Legyen fiatalos, rózsaszín, figyelemfelkeltő világ (5. osztályos kislányoknak), effektekkel.
2. A tananyagok ne legyenek monotonok: minden lecke kicsit más „különlegességeket” kapjon.
3. A tervkészítő, a szerző és a tananyagjavító skillje tartalmazza a design- és változatossági szabályt.
4. A javító úton a tanár kérése („rózsaszín”, „kislány”, „effektek”) kiválaszthassa a világot és a különlegességeket.

## Mért kiindulás
- 14 téma (`EXPERIENCE_THEMES`), 8 színes világ; a runtime-ban az animációk szándékosan ki vannak kapcsolva (`animation: none`); javításnál a téma az előzőt örökli (`deps.previous?.theme`) — ezért ugyanaz marad.
- A helyes kvízválasz gombja `data-state="right"` jelölést kap (LessonExperienceView.tsx) — CSS-effekt köthető rá.

## Megoldás
- `shared/lesson-visuals.ts`: új világ `princess` („Hercegnő-kastély”, rózsaszín–lila–arany, 👑💖🦄🌸✨🎀🏰💎), `LESSON_FLAIRS` = sparkles | shimmer-keys | float-emoji | sticker-headings | glow-cards | pop-correct; `pickLessonFlair(seed, n=3)` determinisztikus, leckénként más; `designFromInstruction(text)` kulcsszavakból (rózsaszín/pink/kislány/lányos/hercegnő → princess; effekt/csillog/animáció → sparkles + shimmer-keys + pop-correct).
- `shared/lesson-experience.ts`: `EXPERIENCE_THEMES` + princess; `experience.flair` opcionális (≤ 4, enum) — régi leckék változatlanul érvényesek.
- `experience-builder.ts`: `flair: deps.flair ?? deps.previous?.flair ?? pickLessonFlair(seed)`.
- Javító út: `designFromInstruction` → `theme` és `flair` a bankösszerakónak; a szerző kérésébe a világ emoji-készlete (fejezet-emoji).
- Runtime: a gyökér `data-flair` attribútumot kap; a hero csillogó díszítőelemei `aria-hidden`; CSS minden effekthez, `prefers-reduced-motion: reduce` és a „csendes” mód kikapcsolja.
- Skillek: tervkészítő (világ a közönséghez, változatosság), szerző (fejezet-emoji a világ készletéből, kiemelés), tananyagjavító (design-kérés teljesítése, változatosság) — rövid, mért hibaosztályhoz kötött sorok.

## Nem cél
A 45/75-ös bankminimum módosítása; új animációs könyvtár; JavaScript-alapú effekt.

## Edge case-ek
Ismeretlen flair a JSON-ban → séma elutasítja (a modell nem írja: kód választja). Mozgáscsökkentés / csendes mód → nincs animáció. Sötét világok → a csillogás színe az akcentből jön.

## Elfogadás
1. `princess` a világok, a témák és a CSS között szinkronban (a meglévő szinkronteszt). (unit)
2. `pickLessonFlair` különböző seedekre eltérő, azonos seedre azonos; 3 elem, ismétlés nélkül. (unit)
3. `designFromInstruction("rózsaszín, kislánynak, effektekkel")` → princess + sparkles/shimmer-keys/pop-correct; semleges kérésre undefined. (unit)
4. A javító út a kért világot és flairt adja a jelöltnek. (unit)
5. Élesben az „Az időszámítás…” lecke a princess világgal és effektekkel jelenik meg (böngészős képernyőkép a websuli.vip-en).
6. tsc (+test), eslint, teljes teszt, build zöld.
