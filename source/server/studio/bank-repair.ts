/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U2, C9): HIBAKÓDHOZ KÖTÖTT JAVÍTÁSI JOGOSULTSÁG a bankcsomag javító
 * módjában. Mért ok (H3/H4): a javító körben a modell a hibától független tételeket is átírta (új hibákkal), vagy
 * csomagszintű hibát (hiányzó módszer, hiányzó szóbeli feladat) próbált tételcserével „javítani”, amit a javító mód nem
 * tud — a kör elveszett. Ezért a validálás hibáiból a program determinisztikusan levezeti, MELYIK tétel MELYIK mezője
 * cserélhető; a javító mód csak ezt engedi (a program kikényszeríti), csomagszintű hiba pedig teljes újraírást kap.
 *
 * Nincs heurisztika: a hibaüzenetek alakját a saját kódunk adja („ID: …”, Zod-útvonal „bank.index.mező”,
 * „…csomaggal: ID („”), és a mezőlista a hiba fajtájából következik. Ismeretlen alakú tételhiba = a tétel minden mezője.
 */

export type BankName = "methods" | "tasks" | "quiz";
export type RepairPermission = { itemId: string; bank: BankName; fields: string[] | "*" };
export type RepairPlan = {
  /** Tételhez kötött hibák: csak ezek a tételek (és mezők) cserélhetők. */
  allows: RepairPermission[];
  /** Tételhez nem köthető (csomagszintű) hibák — tételcserével nem javíthatók, teljes újraírás kell. */
  packetLevel: string[];
};

type PacketIds = { methods: ReadonlyArray<{ id: string }>; tasks: ReadonlyArray<{ id: string }>; quiz: ReadonlyArray<{ id: string }> };
const BANKS: readonly BankName[] = ["methods", "tasks", "quiz"];

const TASK_RUBRIC = ["q", "required", "bonus", "sample", "minWords", "needsSentence", "typedAnswers", "requiredDistinct"];
/** Választós hiba: a kérdés/felhívás is cserélhető (a csupa-igaz opciójú tétel gyakran a kérdés átfogalmazásával javul). */
const CHOICE = ["question", "prompt", "options", "correctIndex", "feedbackPerOption", "answer"];

/** A hiba fajtája → cserélhető mezők (a program saját üzenetei alapján). A tétel címkéi (id, sectionIndex, coversConceptIds) sosem. */
function fieldsFor(message: string, bank: BankName): string[] | "*" {
  if (/a mintaválasz nem teljes pont|hibás referencia|referenciaértéke|köztes alakja/.test(message)) return TASK_RUBRIC;
  if (/correctIndex|opció ugyanazt jelenti|helyes opció|igaz opció|Egyválasztós tétel/.test(message)) return bank === "tasks" ? "*" : CHOICE;
  if (/ábrára hivatkozik/.test(message)) return bank === "tasks" ? ["q", "sample"] : bank === "quiz" ? ["question", "options", "feedbackPerOption"] : ["prompt", "answer", "options", "steps"];
  return "*";
}

/** A hibaüzenetek → javítási terv. A Zod-útvonalú hibánál a mező is az útvonalból jön. */
export function repairPermissions(issues: readonly string[], packet: PacketIds): RepairPlan {
  const byId = new Map<string, BankName>();
  for (const bank of BANKS) for (const item of packet[bank]) byId.set(item.id, bank);
  const allows = new Map<string, RepairPermission>();
  const packetLevel: string[] = [];
  const grant = (itemId: string, bank: BankName, fields: string[] | "*") => {
    const prev = allows.get(itemId);
    const merged: string[] | "*" = prev?.fields === "*" || fields === "*" ? "*" : [...new Set([...(prev?.fields ?? []), ...fields])];
    allows.set(itemId, { itemId, bank, fields: merged });
  };
  for (const issue of issues) {
    const path = /^(methods|tasks|quiz)\.(\d+)(?:\.([A-Za-z]+))?/.exec(issue);
    if (path) {
      const bank = path[1] as BankName, item = packet[bank][Number(path[2])];
      if (item) { grant(item.id, bank, path[3] ? [path[3]] : "*"); continue; }
    }
    // Zod-útvonal index nélkül („tasks: ID: Ismétlődő kérdés (megegyezik: …)”): a tétel az üzenet elején áll.
    const body = issue.replace(/^(?:methods|tasks|quiz): /, "");
    const named = [...byId.keys()].find((id) => body.startsWith(`${id}: `) || body.includes(`csomaggal: ${id} (`));
    if (named) { grant(named, byId.get(named)!, fieldsFor(body, byId.get(named)!)); continue; }
    packetLevel.push(issue);
  }
  return { allows: [...allows.values()], packetLevel };
}

/** A javítás által megváltoztatott mezők (sekély, kanonikus JSON-összevetéssel). */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, canonical: (v: unknown) => string): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => canonical(before[k]) !== canonical(after[k]));
}

/** A modellnek szóló, tömör jogosultsági lista (tétel → mezők). */
export function describeRepairPermissions(allowed: ReadonlyMap<string, string[] | "*">): string {
  return [...allowed].map(([itemId, fields]) => `${itemId}: ${fields === "*" ? "bármely mező" : fields.join(", ")}`).join("; ");
}
