import { experienceFingerprint } from "./experience-fingerprint";

/**
 * B8 (docs/specs/2026-11-25-eredmeny-email-b8.md): nagy entrópiájú, tároló-kompatibilis körazonosító. Az új kör 128 bites véletlen
 * `nonce`-ot kap (a tárolt kör rekordjában); az azonosító `r2-<nonce>`. Nonce nélküli kör (régi, vagy a régi kliens visszaírása, amely az
 * ismeretlen mezőt eldobja) a régi `round-<lenyomat>` azonosítót tartja. A „már elküldve” jelző MINDKÉT azonosítóra vonatkozik.
 */
export const ROUND_NONCE = /^[0-9a-f]{32}$/;
type RoundLike = { ids: readonly string[]; startedAt: number; nonce?: string };

export const legacyRoundIdOf = (round: RoundLike) => `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
export function roundIdOf(round: RoundLike): string {
  return round.nonce && ROUND_NONCE.test(round.nonce) ? `r2-${round.nonce}` : legacyRoundIdOf(round);
}
/** A kör összes „már elküldve” jelzője: elsőként a mostani azonosítóé, utána (ha eltér) a régié. */
export function sentFlagsOf(storageKey: string, kind: string, round: RoundLike): string[] {
  const ids = [roundIdOf(round), legacyRoundIdOf(round)];
  return [...new Set(ids)].map(id => `${storageKey}:${kind}:sent:${id}`);
}
/** 128 bites véletlen nonce (32 kisbetűs hexa jegy). */
export function newRoundNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
