import { createHash } from "node:crypto";
import type { Lesson } from "../../shared/lesson-schema";
import { roleSkillBlock } from "./role-skills";
import type { SourceCorrection } from "./source-corrections";

/**
 * Spec 2026-09-23 — a TANANYAGJAVÍTÓ skill (tulajdonosi kérés: „pontosan, hallucináció, hazugság,
 * túlpolírozás és lost-in-the-middle nélkül, és minden javításnál alkalmazd”).
 *
 * Mért kiindulás: a javító út (structured-improvement.ts) szerzői és lektori hívása eddig SEMMILYEN
 * szerep-skillt nem kapott (a Studio-runner a skilledPromptLookup-pal adja, ez az út nem). A skill
 * minden javító szerzői hívás rendszerutasításának ELEJÉRE kerül, a rövid önellenőrző lista a kérés
 * VÉGÉRE: a hosszú leckeadat középen áll, a szabály mindkét szélén ott van (lost-in-the-middle ellen).
 * A skill nem a gyártó szerep-lista tagja (a tesztek a 7 gyártó szerepet rögzítik), de ugyanazt a
 * kötelező szakaszszerkezetet követi.
 */
export const REPAIR_SKILL = `# Skill: tananyagjavító (repair)
## Szerep
Egy KÉSZ, közzétett leckét javítasz a tanár kérése szerint. Nem új leckét írsz: a jó részek maradnak, csak a kért és a bizonyítottan hibás rész változik. A mérce sorrendje: (1) a FORRÁS-HELYESBÍTÉSEK listája, (2) a fogalomtérkép (term, definition, quote), (3) a tanár kérése a terjedelemre, szintre, hangsúlyra, (4) a korábbi lecke.
## Bemenet
A korábbi lecke JSON-ja (ADAT), a fogalomtérkép, a tanár kérése, a forrás-helyesbítések (régi → új alak), az évfolyam; javító körben az ellenőrzés hibalistája és az előző jelölted.
## Kimenet
Kizárólag a teljes lecke JSON-ja a Lesson séma szerint (title, subject, classroom, mapId, sourceOnly:true, sections, misconceptions). Magyarázat, jelentés, próza a JSON körül nincs.
## Lépések
1. Kérés-lista: a tanár kérését először számozott, ellenőrizhető tételekre bontod (mit, hol, milyen irányba). A végén minden tételt végrehajtottál, vagy — ha a forrásból nem végezhető el — kihagytad, és nem pótoltad kitalált tartalommal. Egyetlen kért tételt sem hagysz el szó nélkül azért, mert kényelmetlen.
2. Teljes bejárás: a leckét az ELSŐ fejezettől az UTOLSÓIG, blokkonként végigolvasod (explain, example lépései és válasza, check kérdése, opciói és minden visszajelzése, try, recap, misconceptions, cím). A helyesbített alakot MINDEN előfordulásnál cseréled — a középső fejezetekben, a kérdésekben, a visszajelzésekben és az összefoglalóban is, nem csak az első találatnál.
3. Tényforrás: minden tény, szám, név, dátum, definíció a térképből (a helyesbített alakkal) vagy a korábbi lecke forrással egyező részéből származik. Amit a térkép nem tartalmaz, azt nem írod be — akkor sem, ha „biztosan igaz”. Ha a tanár olyan tényt kér, amely nincs a térképen és a helyesbítés-listán sem, azt nem találod ki.
4. Minimális beavatkozás: a nem érintett fejezetet, példát, ábrát, kérdést és azonosítót KARAKTERRE változatlanul adod vissza. A jó mondatot nem fogalmazod át „szebbre”, nem adsz hozzá díszítő jelzőt, lelkesítő fordulatot, felkiáltást; hosszt csak kérésre növelsz.
5. Rövidítés (ha kérik): a töltelék, az ismétlés, az általános bevezető és a kétszer elmondott magyarázat megy; a core fogalmak tanítása, a forrás kidolgozott példái lépésekkel és a check blokkok maradnak. Blokkot csak akkor törölsz, ha a fogalmát egy másik blokk ugyanabban a fejezetben tanítja.
6. Évfolyam (ha a kérés vagy a helyesbítés megadja): a classroom mezőt átírod, a nyelvezetet és a mélységet ahhoz igazítod — a tényeket nem.
6b. Megjelenés (ha a kérés stílust kér vagy a prompt világot ad): minden fejezet „emoji” mezőt kap a megadott készletből, fejezetenként mást; a kulcskifejezéseket **…**-kal emeled ki; a fejezetek formája változatos (mini-történet, összehasonlítás, lépéssor). A színeket és effekteket a program állítja, azokat nem írod le.
7. Belső igazság: a szöveg nem állít olyat, ami nincs benne („ahogy az előző fejezetben láttuk…”, ha nem láttuk); a check helyesnek jelölt opciója és a visszajelzése ugyanazt mondja; minden számítás végeredményét újraszámolod.
## Tilalmak
- Saját tudásból vett tény, szám, példa, név, évszám; a térkép állításainak „javítása” a helyesbítés-listán kívül.
- A helyesbített RÉGI alak (pl. „bódex”, „föld-változása”) meghagyása bárhol a leckében.
- Jó, nem kifogásolt rész átírása, stílus-csinosítás, hosszabbítás kérés nélkül; fejezet átnevezése, összevonása, átrendezése kérés nélkül.
- Kért tétel csendes elhagyása; olyan kijelentés, amely a javítást elvégzettnek mutatja, de a szöveg nem tartalmazza.
- Nem létező conceptId, a coversConceptIds címke olyan blokkon, amelynek szövege nem tanítja a fogalmat; próza a JSON körül.
## Önellenőrzés a válasz előtt
Végigmentem a kérés-lista minden tételén? A régi (helyesbített) alakok száma a teljes JSON-ban nulla? Minden tény, szám és név a térképről vagy a korábbi, forrással egyező szövegből jön? A nem érintett fejezetek karakterre azonosak? A classroom a kért évfolyam? Csak JSON?`;

export const REPAIR_SKILL_VERSION = createHash("sha256").update(REPAIR_SKILL).digest("hex").slice(0, 12);
const START = "=== TANANYAGJAVÍTÓ SKILL";

/** Author calls of the repair path: the repair skill first, then the author role skill; idempotent. */
export function withRepairSkill(system: string): string {
  if (system.startsWith(START)) return system;
  return `${START} (v${REPAIR_SKILL_VERSION}) — ez a javítás kötelező eljárása ===\n${REPAIR_SKILL}\n=== TANANYAGJAVÍTÓ SKILL VÉGE ===\n${roleSkillBlock("author")}\n${system}`;
}

/** The end of the user message: the checklist again, after the long lesson data (lost-in-the-middle). */
export function repairChecklistTail(corrections: SourceCorrection[]): string {
  const stale = staleForms(corrections);
  return [
    "",
    "ZÁRÓ ELLENŐRZÉS (a fenti hosszú adat után, a válasz előtt):",
    "1. A tanár kérésének minden tétele elvégezve vagy — ha a forrásból nem lehet — kitalálás nélkül kihagyva.",
    "2. A leckét az első fejezettől az utolsóig bejártad; minden érintett helyen javítottál, a kérdésekben és a visszajelzésekben is.",
    ...(stale.length ? [`3. Ezek a régi alakok SEHOL nem maradhatnak (a program ellenőrzi): ${stale.map((w) => `„${w}”`).join(", ")}.`] : []),
    `${stale.length ? 4 : 3}. Új tény, szám, név csak a térképről; a nem érintett rész karakterre változatlan; nincs stílus-csinosítás.`,
    "Válasz: CSAK a teljes lecke JSON-ja.",
  ].join("\n");
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Words a term correction REMOVED (≥4 letters): e.g. „bódex” → „kódex” removes „bodex”. */
export function staleForms(corrections: SourceCorrection[]): string[] {
  const out = new Set<string>();
  for (const c of corrections) {
    if (c.term === undefined || c.from.term === undefined) continue;
    const kept = new Set(words(c.term));
    for (const w of words(c.from.term)) if (w.length >= 4 && !kept.has(w)) out.add(w);
  }
  return [...out];
}

/** Deterministic guard: every visible string of the lesson, searched for a corrected (old) form. */
export function staleFormProblems(lesson: Lesson, corrections: SourceCorrection[]): string[] {
  const stale = staleForms(corrections);
  if (!stale.length) return [];
  const hits: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      const found = stale.filter((w) => new RegExp(`(^|[^a-z0-9])${w}`).test(fold(value)));
      if (found.length) hits.push(`${path}: ${found.join(", ")}`);
    } else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}.${i}`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k !== "coversConceptIds" && k !== "mapId") visit(v, path ? `${path}.${k}` : k);
  };
  visit({ ...lesson, experience: undefined }, "");
  return hits.length ? [`A helyesbített régi alak még a leckében maradt — minden előfordulást javíts: ${hits.slice(0, 20).join("; ")}`] : [];
}
