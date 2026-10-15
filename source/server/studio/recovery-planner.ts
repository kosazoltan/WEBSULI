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
  const floor = new Set<string>();
  for (const m of error.matchAll(/(\w+): hiányzó (recall|apply) kvíz/g)) floor.add(`${m[1]}:${m[2]}`);
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
export function planRecovery(input: { error: string; history: readonly RecoveryStep[] }): RecoveryPlan {
  const fp = failureFingerprint(input.error);
  const ladder = RECOVERY_LADDER[fp.cls];
  const used = input.history.filter((h) => h.fingerprint.startsWith(`${fp.cls}|`));
  const last = used.at(-1);
  if (last && last.strategy !== "remanufacture" && last.strategy !== "ask-owner" && fp.failing < last.failing) {
    const repeats = used.filter((h) => h.strategy === last.strategy).length;
    const allowed = ladder.filter((s) => s === last.strategy).length + 1;
    if (repeats < allowed) return { strategy: last.strategy, reason: `${REASONS[last.strategy]} (az előző lépés hatott: ${last.failing} → ${fp.failing} hibás tétel)`, fingerprint: fp.key, cls: fp.cls };
  }
  const remaining = [...ladder];
  for (const h of used) { const i = remaining.indexOf(h.strategy); if (i >= 0) remaining.splice(i, 1); }
  const next = remaining[0];
  if (!next) {
    const detail = fp.failing ? ` — a megmaradt hiba: ${fp.key.split("|").slice(1).filter(Boolean).join("; ")}` : "";
    return { strategy: "ask-owner", reason: `${REASONS["ask-owner"]}${detail}`, fingerprint: fp.key, cls: fp.cls };
  }
  return { strategy: next, reason: REASONS[next], fingerprint: fp.key, cls: fp.cls };
}
