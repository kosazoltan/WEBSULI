/**
 * Elakadás-vezérlő V1 (docs/specs/2026-10-15-elakadas-vezerlo.md, tulajdonosi kérés 2026-10-15): tiszta döntési függvény — a megállt
 * gyártás hiba-ujjlenyomata és a vezérlő eddigi lépései alapján a következő, LEGKISEBB elégséges lépés. A minőségi mérce nem lazul:
 * a lépcső csak azt választja meg, MIT gyártunk újra, a kapu ugyanazzal a mércével dönt. Ugyanaz a stratégia ugyanarra a hibára nem fut
 * kétszer (a `retry-provider` legfeljebb kétszer), a lépcső véges; ha elfogy: tulajdonosi döntés pontos indoklással.
 */

export type RecoveryStrategy = "retry-provider" | "review" | "gate" | "rebuild-targeted" | "rebuild-full" | "author-repair" | "remanufacture" | "ask-owner";
export type FailureClass = "provider" | "evidence" | "bank-floor" | "bank-packet" | "other";
export type RecoveryStep = { strategy: RecoveryStrategy; fingerprint: string; failing: number; at: number };
export type RecoveryPlan = { strategy: RecoveryStrategy; reason: string; fingerprint: string; cls: FailureClass };

/** A lépcső osztályonként: a legolcsóbb, legkisebb újragyártástól a teljes újragyártásig. */
export const RECOVERY_LADDER: Record<FailureClass, readonly RecoveryStrategy[]> = {
  provider: ["retry-provider", "retry-provider", "remanufacture"],
  evidence: ["review", "rebuild-full", "remanufacture"],
  "bank-floor": ["gate", "rebuild-targeted", "rebuild-full", "author-repair", "remanufacture"],
  "bank-packet": ["retry-provider", "rebuild-targeted", "author-repair", "remanufacture"],
  other: ["author-repair", "remanufacture"],
};

function classOf(error: string): FailureClass {
  if (/modellhívása hibára futott|timed out|timeout|időtúllép/i.test(error)) return "provider";
  if (/a lektorált bemenet eltér a mostanitól/.test(error)) return "evidence";
  if (/^Hibás banktétel maradt a limiten|^Egyválasztós hiba maradt a bankban/.test(error)) return "bank-floor";
  if (/bankcsomagja a javító kör után sem megfelelő/.test(error)) return "bank-packet";
  return "other";
}

/** Szövegfüggetlen ujjlenyomat: osztály + a hibás útvonalak rendezett halmaza + a padló-hiányok. */
export function failureFingerprint(error: string): { cls: FailureClass; key: string; failing: number } {
  const cls = classOf(error);
  const paths = new Set<string>();
  for (const m of error.matchAll(/experience\.(tasks|quiz|methods)\[(\d+)\]/g)) paths.add(`${m[1]}[${m[2]}]`);
  for (const m of error.matchAll(/sections\[(\d+)\]/g)) paths.add(`sections[${m[1]}]`);
  for (const m of error.matchAll(/A (\d+)\. fejezet/g)) paths.add(`fejezet ${m[1]}`);
  // Review #234 (P2): a szolgáltatói hibánál a megállt lépés (szerző / animátor / lektor) is az ujjlenyomat része.
  if (cls === "provider") for (const m of error.matchAll(/"(\w+)" lépés/g)) paths.add(`lépés ${m[1]}`);
  const floor = new Set<string>();
  // Review #233 (P2): a teljes fogalomazonosító (a kötőjeles is, pl. „kor-kerulete”).
  for (const m of error.matchAll(/([^\s:;,()]+): hiányzó (recall|apply) kvíz/g)) floor.add(`${m[1]}:${m[2]}`);
  if (/Legalább 45 szöveges feladat és 75 kvízkérdés/.test(error)) floor.add("45/75");
  const sortedPaths = [...paths].sort(), sortedFloor = [...floor].sort();
  return { cls, key: `${cls}|${sortedPaths.join(",")}|${sortedFloor.join(",")}`, failing: sortedPaths.length };
}

const REASONS: Record<RecoveryStrategy, string> = {
  "retry-provider": "átmeneti szolgáltatói hiba volt — ugyanaz a lépés újraindul a mentett részekből",
  review: "a lektori ellenőrzés a mostani tananyagon újrafut",
  gate: "az ellenőrzés újrafut, a hibás feladatokat célzottan javítja, a javíthatatlanokat a tartalékból pótolja",
  "rebuild-targeted": "csak a hibás feladatokat tartalmazó fejezetek gyakorlóbankja épül újra, a többi megmarad",
  "rebuild-full": "a tanítás megmarad, a teljes gyakorlóbank új tartalékkal újraépül",
  "author-repair": "a hibás fejezetek tanítása célzott szerzői javítást kap, utána a bank és az ellenőrzés",
  remanufacture: "a tananyag ugyanabból a forrásból teljesen újra készül (a mostani piszkozat megmarad)",
  "ask-owner": "a program minden saját megoldást kipróbált — tulajdonosi döntés szükséges",
};
export const recoveryReason = (strategy: RecoveryStrategy) => REASONS[strategy];

/**
 * A következő lépés. Egy stratégia osztályonként egyszer (a lépcsőben kétszer szereplő `retry-provider` kétszer) — kivéve, ha az utolsó lépés
 * HATOTT (ugyanaz az osztály, kevesebb hibás útvonal): akkor az egyszer még megismételhető (a `remanufacture` soha).
 */
/**
 * A következő lépés. Review #234 (P2): a fok az ADOTT ujjlenyomatra számít felhasználtnak — egy új hibára (más tételek) az olcsó fok újra
 * elérhető. Hogy a lépcső véges maradjon: osztályonként egy fok legfeljebb (a lépcsőbeli előfordulása + 1)-szer fut (a hatásos lépés így
 * egyszer megismételhető), a teljes újragyártás legfeljebb egyszer; ha elfogy: tulajdonosi döntés pontos indoklással.
 */
export function planRecovery(input: { error: string; history: readonly RecoveryStep[] }): RecoveryPlan {
  const fp = failureFingerprint(input.error);
  const ladder = RECOVERY_LADDER[fp.cls];
  const inClass = input.history.filter((h) => h.fingerprint.startsWith(`${fp.cls}|`));
  const count = (list: readonly RecoveryStep[], strategy: RecoveryStrategy) => list.filter((h) => h.strategy === strategy).length;
  const sameKey = inClass.filter((h) => h.fingerprint === fp.key);
  for (const strategy of new Set(ladder)) {
    const occurrences = ladder.filter((s) => s === strategy).length;
    const classLimit = strategy === "remanufacture" ? 1 : occurrences + 1;
    if (count(sameKey, strategy) >= occurrences || count(inClass, strategy) >= classLimit) continue;
    const last = inClass.at(-1);
    const reason = last && last.strategy === strategy && fp.failing < last.failing
      ? `${REASONS[strategy]} (az előző lépés hatott: ${last.failing} → ${fp.failing} hibás tétel)` : REASONS[strategy];
    return { strategy, reason, fingerprint: fp.key, cls: fp.cls };
  }
  const detail = fp.failing ? ` — a megmaradt hiba: ${fp.key.split("|").slice(1).filter(Boolean).join("; ")}` : "";
  return { strategy: "ask-owner", reason: `${REASONS["ask-owner"]}${detail}`, fingerprint: fp.key, cls: fp.cls };
}

/** A mentett részekből (a „Folytatás” gombbal / a vezérlővel) NEM indítható fokok: V4-ig, illetve tulajdonosi döntés. */
export const NOT_RESUMABLE_STRATEGIES: readonly RecoveryStrategy[] = ["author-repair", "remanufacture", "ask-owner"];
