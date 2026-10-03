import type { AIMessage } from "./AIProvider";

/**
 * Spec 2026-10-03-gpt61-sol-kv-cache: közös KV-cache (prompt caching) segédek az Anthropic-hívásokhoz.
 * Szabály: a statikus rész (skill + feladat + spec) ELÖL, `cache_control` töréspont a végén; a változó adat (téma, cím,
 * tartalom, metadata, egyedi utasítás) UTÁNA. A minimum alatti előtagot a szolgáltató egyszerűen nem cache-eli (nem hiba).
 */
export const EPHEMERAL = { type: "ephemeral" as const };
export type SystemBlock = { type: "text"; text: string; cache_control?: typeof EPHEMERAL };

/** Statikus rész töréspontos blokkban, a változó rész (ha van) utána, töréspont nélkül. */
export function cachedSystem(staticPart: string, dynamicPart = ""): SystemBlock[] {
  const blocks: SystemBlock[] = [{ type: "text", text: staticPart, cache_control: EPHEMERAL }];
  if (dynamicPart.trim()) blocks.push({ type: "text", text: dynamicPart });
  return blocks;
}

/**
 * AIMessage-alapú szolgáltatóhoz: egy system-üzenet → változatlan szöveg; több → blokkok, a töréspont az utolsó ELŐTTI
 * system-üzenet végén (a hívó az utolsóba teszi a változó részt).
 */
export function claudeSystemFromMessages(contents: string[]): string | SystemBlock[] {
  if (contents.length <= 1) return contents[0] ?? "";
  return contents.map((text, i) => (i === contents.length - 2 ? { type: "text" as const, text, cache_control: EPHEMERAL } : { type: "text" as const, text }));
}

type ClaudeTurn = { role: "user" | "assistant"; content: string | Array<{ type: "text"; text: string; cache_control?: typeof EPHEMERAL }> };

/**
 * Folytatásos beszélgetés (van már assistant-válasz): az első user-üzenet (pl. a teljes eredeti tananyag) töréspontot kap,
 * így a folytatási körök ezt a gyorsítótárból olvassák. Egyszeri hívásnál változatlan.
 */
export function cacheConversation(messages: AIMessage[]): ClaudeTurn[] {
  const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (!turns.some((m) => m.role === "assistant")) return turns;
  const first = turns.findIndex((m) => m.role === "user");
  if (first < 0) return turns;
  return turns.map((m, i) => (i === first ? { ...m, content: [{ type: "text" as const, text: m.content, cache_control: EPHEMERAL }] } : m));
}
