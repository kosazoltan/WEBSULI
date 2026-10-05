import type { LessonType } from "./catalog-taxonomy";

/**
 * Spec 2026-10-05-s4-tantargyi-skillek: lecketípus-skillek — a szülő-ellenőrzött katalógus lecketípusainak SZERKEZETI szabályai.
 * Kézzel írt, rövid; a mért típusonkénti tételtípus-arány a `docs/measurements/<nap>-lesson-type-shape.json`-ban (a
 * `build-subject-skills.mts` méri). Tartalmi tudást nem hordoz — az a tantárgyi skillben van.
 */
export const LESSON_TYPE_SKILLS: Record<LessonType, string> = {
  fogalomtanito: [
    "# Lecketípus: fogalom-tanító tartalomlecke",
    "- Szakaszrend: rövid ráhangolás → fogalom fejezetenként (definíció, példa, ellenpélda) → összefoglalás → ellenőrző kérdések.",
    "- Minden fejezet egy fogalmat tanít; a kérdések csak a fejezetekben tanított tartalomra kérdeznek.",
    "- Arány: a magyarázó szöveg a lecke gerince; a kvíz a fogalmak megkülönböztetését méri (disztraktor = tipikus tévhit).",
  ].join("\n"),
  "gyakorlo-feladatlap": [
    "# Lecketípus: gyakorló feladatlap",
    "- Kevés magyarázat (egy mintapélda lépésenként), sok feladat fokozódó nehézséggel.",
    "- Minden számolós feladatnak egyértelmű, gépileg ellenőrizhető válasza legyen (rövid válasz elfogadott alakokkal).",
    "- Feladatcsoportok típusonként; minden csoport elején egy kidolgozott minta.",
  ].join("\n"),
  "szokincs-nyelvi": [
    "# Lecketípus: szókincs- és nyelvi forma lecke",
    "- Szópárok/kifejezések témakörönként, kiejtéssel; sok rövid, gyors kérdés.",
    "- Ugyanaz a szó ne szerepeljen két opcióként; a disztraktor hasonló alakú vagy jelentésű szó.",
    "- Nyelvtani forma: szabály → 3–5 példa → átalakító feladatok.",
  ].join("\n"),
  "irodalmi-mu": [
    "# Lecketípus: irodalmi mű feldolgozása",
    "- Szakaszrend: szerző és keletkezés → tartalom (cselekmény, szereplők) → értelmezés (motívum, téma, műfaj) → szövegértés.",
    "- A kérdések a műből idézett vagy összefoglalt tartalomra épülnek; véleménykérdésnél nyílt feladat kulcsszavakkal.",
  ].join("\n"),
  "temazaro-felkeszito": [
    "# Lecketípus: témazáró / mérésre felkészítő",
    "- Több témakör rövid összefoglalója, utána vegyes feladatsor témakörönként jelölve.",
    "- A feladatok a témakörök mérési céljait fedik le; minden témakörre jusson feladat.",
  ].join("\n"),
  "tanuloi-munka-javitas": [
    "# Lecketípus: tanulói munka javítása",
    "- A tanuló hibás megoldása NEGATÍV példa: soha nem kerül tényként a tananyagba; mindig a helyesbítés mellett áll.",
    "- Szerkezet: a hiba megmutatása → miért hibás → helyes lépéssor → hasonló gyakorló feladat.",
  ].join("\n"),
  "gyakorlati-projekt": [
    "# Lecketípus: gyakorlati / projekt jellegű",
    "- Cél → eszközök → lépésenkénti útmutató → ellenőrzőlista → reflexiós kérdések.",
    "- Minden lépés végrehajtható és ellenőrizhető legyen.",
  ].join("\n"),
  egyeb: "# Lecketípus: egyéb\n- Nincs típus-specifikus szerkezeti szabály; a tantárgyi skill és az általános lecke-szabályok érvényesek.",
};
