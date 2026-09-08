export type BlockCraftSubject = "english" | "english-math" | "math" | "nature" | "hungarian";

/** A3: material topic → BlockCraft subject pool. */
export function blockCraftSubjectFromTopic(topic: string | null | undefined): BlockCraftSubject {
  const t = (topic ?? "").toLowerCase();
  if (t === "math") return "math";
  if (t === "nature") return "nature";
  if (t === "hungarian") return "hungarian";
  if (t === "english") return "english";
  return "english";
}
