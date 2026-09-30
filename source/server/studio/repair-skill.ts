import { workflowRuntimeVersion } from "../workflows/engine";
import { isFrozenBundle } from "../../shared/instruction-bundles/roles";
import { REPAIR_SKILL_V2 } from "../../shared/instruction-bundles/websuli-runtime-2";
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
- A helyesbített RÉGI ÁLLÍTÁS bárhol a leckében (pl. „bódex” a kódex neveként); a régi szó MÁS értelemben megengedett („a Föld körül kering”).
- Jó, nem kifogásolt rész átírása, stílus-csinosítás, hosszabbítás kérés nélkül; fejezet átnevezése, összevonása, átrendezése kérés nélkül.
- Kért tétel csendes elhagyása; olyan kijelentés, amely a javítást elvégzettnek mutatja, de a szöveg nem tartalmazza.
- Nem létező conceptId, a coversConceptIds címke olyan blokkon, amelynek szövege nem tanítja a fogalmat; próza a JSON körül.
## Önellenőrzés a válasz előtt
Végigmentem a kérés-lista minden tételén? A helyesbített régi állítás sehol nem szerepel? Minden tény, szám és név a térképről vagy a korábbi, forrással egyező szövegből jön? A nem érintett fejezetek karakterre azonosak? A classroom a kért évfolyam? Csak JSON?`;

export const REPAIR_SKILL_VERSION = createHash("sha256").update(REPAIR_SKILL).digest("hex").slice(0, 12);
const START = "=== TANANYAGJAVÍTÓ SKILL";

const REPAIR_SKILL_VERSION_V2 = createHash("sha256").update(REPAIR_SKILL_V2).digest("hex").slice(0, 12);

/** Author calls of the repair path: the repair skill first, then the author role skill; idempotent.
 *  Spec 2026-09-30 (B0): a runtime-1/-2 pillanatkép a befagyasztott javító-skillt kapja. */
export function withRepairSkill(system: string, version: string | undefined = workflowRuntimeVersion()): string {
  if (system.startsWith(START)) return system;
  const frozen = isFrozenBundle(version);
  const text = frozen ? REPAIR_SKILL_V2 : REPAIR_SKILL;
  const v = frozen ? REPAIR_SKILL_VERSION_V2 : REPAIR_SKILL_VERSION;
  return `${START} (v${v}) — ez a javítás kötelező eljárása ===\n${text}\n=== TANANYAGJAVÍTÓ SKILL VÉGE ===\n${roleSkillBlock("author", version)}\n${system}`;
}

/** The end of the user message: the checklist again, after the long lesson data (lost-in-the-middle). */
export function repairChecklistTail(corrections: SourceCorrection[]): string {
  const stale = staleForms(corrections);
  return [
    "",
    "ZÁRÓ ELLENŐRZÉS (a fenti hosszú adat után, a válasz előtt):",
    "1. A tanár kérésének minden tétele elvégezve vagy — ha a forrásból nem lehet — kitalálás nélkül kihagyva.",
    "2. A leckét az első fejezettől az utolsóig bejártad; minden érintett helyen javítottál, a kérdésekben és a visszajelzésekben is.",
    ...(stale.length ? [`3. A helyesbített régi állítás SEHOL nem maradhat (a program ellenőrzi): ${stale.map((w) => `„${w}”`).join(", ")} — a szó más értelemben (pl. „a Föld”) megengedett.`] : []),
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

/** Whole-word occurrence (both sides bounded) of a folded stale word — „fold” nem illeszkedik a „földrajz” szóra (H43). */
const wholeWord = (folded: string, w: string) => new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`).test(folded);

function visitStrings(lesson: Lesson, visit: (text: string, path: string) => void) {
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") visit(value, path);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}.${i}`));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k !== "coversConceptIds" && k !== "mapId") walk(v, path ? `${path}.${k}` : k);
  };
  walk({ ...lesson, experience: undefined }, "");
}

/**
 * Spec 2026-09-30 (U6, C16/H43): a régi alak két esete.
 * - TISZTA régi alak (a régi kifejezésnek nincs megtartott szava: „terlet” → „terület”, „bódex” → „kódex”): a szó
 *   bármely egész-szavas előfordulása maga a régi állítás → determinisztikus hiba (ez a függvény).
 * - ÖSSZETETT régi alak („föld-változása” → „Hold változása”): a régi szó („föld”) más értelemben helyes lehet („a Föld
 *   körül kering”) — ezt a `staleFormCandidates` JELÖLTKÉNT adja, és a javító-lektor dönt.
 */
export function staleFormProblems(lesson: Lesson, corrections: SourceCorrection[], sourceWords: ReadonlySet<string> = new Set()): string[] {
  const pure = staleForms(corrections.filter((c) => verifiedMisspelling(c, sourceWords)));
  if (!pure.length) return [];
  const hits: string[] = [];
  visitStrings(lesson, (text, path) => {
    // A tiszta régi alak nem létező szó („terlet”), ezért a ragozott alakja is hiba — itt a bal oldali szóhatár elég.
    const found = pure.filter((w) => new RegExp(`(^|[^a-z0-9])${w}`).test(fold(text)));
    if (found.length) hits.push(`${path}: ${found.join(", ")}`);
  });
  return hits.length ? [`A helyesbített régi alak még a leckében maradt — minden előfordulást javíts: ${hits.slice(0, 20).join("; ")}`] : [];
}

/**
 * Review #164: a „megtartott szó nélküli” javítás NEM bizonyítja, hogy a régi alak nem létező szó — egy átírási
 * helyesbítés valódi szót is cserélhet („Föld” → „Hold”), amely a leckében más, helyes értelemben állhat. Determinisztikus
 * hiba csak az IGAZOLT elírás: a régi szó (a) az új alak egy szavának közeli alakja (legfeljebb 2 betű eltérés), és
 * (b) a forrásban (a térkép fogalmainak szövegében, a helyesbített megnevezéseken kívül) sehol nem fordul elő. Minden más
 * régi szó a jelölt-úton megy a javító-lektorhoz.
 */
export function verifiedMisspelling(c: SourceCorrection, sourceWords: ReadonlySet<string>): boolean {
  if (c.term === undefined || c.from.term === undefined || keptWords(c).length > 0) return false;
  const stale = staleForms([c]);
  const now = words(c.term);
  return stale.length > 0 && stale.every((w) => !sourceWords.has(w) && now.some((n) => editDistance(w, n) <= 2));
}

/** A forrás szókészlete (összehajtva): a fogalmak megnevezése, definíciója, idézete — a helyesbített megnevezés nélkül. */
export function sourceWordSet(concepts: ReadonlyArray<{ localId: string; term?: string | null; definition?: string | null; quote?: string | null }>, corrections: SourceCorrection[]): Set<string> {
  const corrected = new Set(corrections.filter((c) => c.from.term !== undefined).map((c) => c.localId));
  const out = new Set<string>();
  for (const c of concepts) for (const text of [corrected.has(c.localId) ? undefined : c.term, c.definition, c.quote]) if (text) for (const w of words(text)) out.add(w);
  return out;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** A javítás megtartott (az új alakban is szereplő, ≥ 4 betűs) szavai — ezek a fogalom kulcsszavai. */
function keptWords(c: SourceCorrection): string[] {
  if (c.term === undefined || c.from.term === undefined) return [];
  const now = new Set(words(c.term));
  return words(c.from.term).filter((w) => w.length >= 4 && now.has(w));
}

export type StaleCandidate = { id: string; path: string; sentence: string; oldForm: string; newForm: string };
/** Szóegyüttállás egy mondatban: a régi szó (egész szóként) + a fogalom megtartott kulcsszava → JELÖLT, nem hiba. */
export function staleFormCandidates(lesson: Lesson, corrections: SourceCorrection[], sourceWords: ReadonlySet<string> = new Set()): StaleCandidate[] {
  const out: StaleCandidate[] = [];
  for (const c of corrections) {
    if (c.term === undefined || c.from.term === undefined || verifiedMisspelling(c, sourceWords)) continue;
    const kept = keptWords(c);
    const stale = staleForms([c]);
    if (!stale.length) continue;
    visitStrings(lesson, (text, path) => {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const f = fold(sentence);
        if (kept.length) {
          if (!stale.some((w) => wholeWord(f, w))) continue;
          const sentenceWords = f.split(/[^a-z0-9]+/);
          if (!kept.some((k) => sentenceWords.some((w) => w.startsWith(k.slice(0, Math.min(5, k.length)))))) continue;
        } else if (!stale.some((w) => new RegExp(`(^|[^a-z0-9])${w}`).test(f))) continue; // valódi szó cseréje: ragozva is jelölt
        out.push({ id: `stale-${out.length}`, path, sentence: sentence.slice(0, 400), oldForm: c.from.term!, newForm: c.term! });
      }
    });
  }
  return out;
}

export type StaleVerdict = { id: string; verdict: "igen" | "nem" | "bizonytalan"; reason: string };
/** Review #164: az eldöntetlen jelölt a javítás-artefaktumban (`lessonRepairSchema.staleWarnings`). */
export type StaleWarning = { path: string; sentence: string; oldForm: string; newForm: string; reason: string };
/** A javító-lektor kérdése: a mondat a RÉGI (helyesbített) állítást állítja-e? */
export function buildStaleJudgePrompt(candidates: StaleCandidate[]): { system: string; user: string } {
  return {
    system: [
      "JAVÍTÓ-LEKTOR — RÉGI ÁLLÍTÁS ELLENŐRZÉSE (spec 2026-09-30, C16).",
      "Minden jelölt mondatról döntsd el: a mondat a HELYESBÍTETT RÉGI ÁLLÍTÁST állítja-e (igen), vagy a régi szó más, helyes értelemben szerepel / a mondat épp a helyes alakot tanítja (nem). Ha a mondatból nem dönthető el: bizonytalan.",
      "A puszta szóelőfordulás nem hiba: „Nem a Föld változása, hanem a Hold változása adja a naptárt” → nem; „A föld-változása alapján készítettek naptárt” → igen.",
      'Kizárólag JSON: { "items": [{ "id": string, "verdict": "igen"|"nem"|"bizonytalan", "reason": string }] } — minden id-hoz pontosan egy elem.',
    ].join("\n"),
    user: JSON.stringify({ candidates: candidates.map((c) => ({ id: c.id, sentence: c.sentence, oldForm: c.oldForm, newForm: c.newForm })) }),
  };
}
export function parseStaleVerdicts(json: unknown, candidates: StaleCandidate[]): StaleVerdict[] {
  const items = (json as { items?: unknown } | null)?.items;
  const byId = new Map<string, StaleVerdict>();
  if (Array.isArray(items)) for (const raw of items) {
    const it = raw as { id?: unknown; verdict?: unknown; reason?: unknown };
    if (typeof it?.id !== "string" || byId.has(it.id)) continue;
    const verdict = it.verdict === "igen" || it.verdict === "nem" || it.verdict === "bizonytalan" ? it.verdict : "bizonytalan";
    byId.set(it.id, { id: it.id, verdict, reason: typeof it.reason === "string" ? it.reason.slice(0, 300) : "" });
  }
  // A nem jelentett jelölt eldöntetlen (H51 elve: a hiányzó ítélet nem „nem”).
  return candidates.map((c) => byId.get(c.id) ?? { id: c.id, verdict: "bizonytalan", reason: "az ellenőrző nem adott ítéletet" });
}
