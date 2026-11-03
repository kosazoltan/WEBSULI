import { createHash } from "node:crypto";

/** Kulcssorrendtől független JSON (a javítási és a tanulási hash-ek közös alapja). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export const repairHash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
