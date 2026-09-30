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
  | "step_error"
  /** Spec 2026-09-30-nem-elakado-kozzetetel: a limiten hiány-jellegű (nem hamis) tanítási jegyzet figyelmeztetésként. */
  | "lektor_incomplete"
  /** Spec 2026-09-30-nem-elakado-kozzetetel: a kapu a limiten nem-ténybeli lelettel, a 95/80-as szabály szerint publikált. */
  | "gate_limit_accepted"
  /** Spec 2026-09-30-nem-elakado-kozzetetel: forrás/füzet-hivatkozás maradt a gyereknek szóló szövegben. */
  | "source_reference"
  /** Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés egy tartalmi pontja a javítás után is hiányzik. */
  | "instruction_missing"
  /** Spec 2026-09-30-utasitasrendszer-rendbetetel (U3, C14): a kérés forrásból nem igazolható pontjai — nem tanítjuk, jelezzük. */
  | "instruction_gaps"
  /** U4 (H50): a tervező vázlatának mezőit a program a korláton vágta/elhagyta — jelölt állapot, nem néma. */
  | "outline_clamped";

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
  lektor_incomplete: "A lektor hiányt (nem tévedést) jelzett a körlimiten — a lecke elkészült, a hiány a jegyzetekben szerepel.",
  gate_limit_accepted: "A kapu a körlimiten nem-ténybeli hiányt mért (fedettség ≥ 95/80%) — a lecke elkészült, az okok a job kimenetében.",
  source_reference: "A gyereknek szóló szövegben forrás- vagy füzethivatkozás maradt — a lecke elkészült, a helyek a job kimenetében.",
  instruction_missing: "A tanári kérés egy vagy több pontja a javítás után is hiányzik — a lecke elkészült, a pontok a job kimenetében.",
  instruction_gaps: "A tanári kérés egy vagy több pontját a forrás nem igazolja — a lecke ezeket nem tanítja, a pontok a job kimenetében és a panelen.",
  outline_clamped: "A tervező vázlatának egyes mezői a korláton túl voltak: a program vágta vagy elhagyta őket — a részletek a job kimenetében.",
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
