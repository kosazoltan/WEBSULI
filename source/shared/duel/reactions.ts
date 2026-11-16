/**
 * Előre megírt párbaj-reakciók (terv 10.5 „Kommunikáció”, 10.9 gyermekvédelem): szabad szöveg nincs, a kliens csak az
 * azonosítót küldi, a szerver (JM2) a listán kívülit elutasítja.
 */
export const REACTIONS: readonly { id: string; label: string }[] = [
  { id: "nice", label: "Szép volt!" },
  { id: "congrats", label: "Gratulálok!" },
  { id: "rematch", label: "Visszavágó?" },
  { id: "clap", label: "👏" },
  { id: "party", label: "🎉" },
  { id: "wow", label: "😮" },
];

const IDS = new Set(REACTIONS.map((r) => r.id));

export function isReactionId(id: unknown): id is string {
  return typeof id === "string" && IDS.has(id);
}

export function reactionLabel(id: string): string | null {
  return REACTIONS.find((r) => r.id === id)?.label ?? null;
}
