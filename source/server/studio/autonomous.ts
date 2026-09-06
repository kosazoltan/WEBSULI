/**
 * LS-7 (#189) — autonóm döntéshozás az egygombos tananyaggyártáshoz.
 *
 * Tulajdonosi döntés (2026-09-06): „Nincs tudásbázis elfogadás, nincs lektorálás,
 * minden legyen automatizálva… Nincsenek fölösleges emberi kapuk. A maximum
 * utólagos javítási prompt lehetőség legyen."
 *
 * Mérve élesben: a Studio panel „Vázlat jóváhagyása" gombja
 * `Nem hagyható jóvá — Csak a szerző lépésre váró job vázlata hagyható jóvá`
 * hibát adott — a futás emberi döntésre parkolt, és ott is maradt.
 *
 * AMI MEGMARAD (gépi ellenőrzés, nem emberi kapu):
 *   - verbatim idézet-ellenőrzés (D1: a forrás nyer),
 *   - térkép-fedettség mérése,
 *   - séma-validáció (blokk-fajták, zod),
 *   - a publikálási kapu MÉRÉSE.
 *
 * AMI MEGVÁLTOZIK: a mérés eredménye nem PARKOL emberre. A gép javító kört fut,
 * és ha a kör-limitet is kimerítette, a tananyagot ELKÉSZÍTI, a hiányt pedig
 * jelzésként (`qualityNotes`) rögzíti, amit az admin utólagos javító prompttal
 * kezelhet. Technikai hiba (modell/séma/DB) továbbra is hiba — azt nem
 * „fogadjuk el", mert abból nem lesz tananyag.
 */

/** Hány gépi javító kört engedünk, mielőtt jelzéssel publikálunk. */
export const AUTONOMOUS_MAX_ROUNDS = 2;

export type AutonomousReason =
  /** A vázlat nem fedi a térképet (hiányzó kulcsfogalom / ismeretlen id / kevés kiegészítő). */
  | "coverage"
  /** A lektor blokkoló jegyzetet írt. */
  | "lektor_blocker"
  /** A publikálási kapu (séma + fedettség) elutasította a leckét. */
  | "gate_rejected"
  /** Technikai hiba: modellhívás, zod-séma, DB. */
  | "step_error";

export type AutonomousInput = {
  reason: AutonomousReason;
  round: number;
  detail: string;
};

export type AutonomousDecision = {
  /** retry = gépi javító kör; accept = elkészítjük jelzéssel; fail = valódi hiba. */
  action: "retry" | "accept" | "fail";
  nextRound?: number;
  /** Az elfogadott hiány emberi olvasható jelzése (a tananyag mellé kerül). */
  note?: string;
};

const ACCEPT_NOTES: Record<Exclude<AutonomousReason, "step_error">, string> = {
  coverage:
    "A vázlat térkép-fedettsége a gépi javító körök után sem lett teljes — " +
    "a lecke elkészült, de érdemes utólagos javító prompttal pótolni a hiányt.",
  lektor_blocker:
    "A lektor a gépi javító körök után is jelzett blokkolót — a lecke elkészült, " +
    "a lektor jegyzetei a Studio panelen olvashatók.",
  gate_rejected:
    "A publikálási kapu a gépi javító körök után is hiányt mért — a lecke elkészült, " +
    "a kapu indoklása a job kimenetében szerepel.",
};

/**
 * Mit tegyen az autonóm futás egy mért hiánnyal.
 *
 * A technikai hiba (`step_error`) SOHA nem elfogadható: abból nem lesz tananyag,
 * és elhallgatva pont az a néma beragadás jön vissza, amit a #168/#183 javított.
 */
export function autonomousDecision(input: AutonomousInput): AutonomousDecision {
  if (input.reason === "step_error") {
    return { action: "fail" };
  }
  if (input.round < AUTONOMOUS_MAX_ROUNDS) {
    return { action: "retry", nextRound: input.round + 1 };
  }
  return { action: "accept", note: `${ACCEPT_NOTES[input.reason]} (${input.detail})` };
}

/** A tananyag mellé mentett jelzések alakja. */
export type QualityNote = { reason: AutonomousReason; note: string; round: number };

/** Jelzés-lista építése; a `null` bemenet üres listát ad (nincs jelzés). */
export function appendQualityNote(
  existing: unknown,
  entry: QualityNote,
): QualityNote[] {
  const list = Array.isArray(existing) ? (existing as QualityNote[]) : [];
  return [...list, entry];
}
