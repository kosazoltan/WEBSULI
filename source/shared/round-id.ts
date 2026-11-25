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
/**
 * Review #613: a nonce a kör rekordjától KÜLÖN, a régi azonosító szerinti kulcson is tartósan megmarad (a régi kliens ezt a kulcsot nem
 * ismeri, így nem is írja vissza). Ha a régi kliens visszaírása a kör rekordjából eldobja a nonce-ot, a következő betöltés innen
 * visszaveszi — a kör azonosítója (és vele a kilét-rekord, a jelzők, a sor bejegyzése és a szerveres kör) nem vált `round-…`-ra.
 * Csak megkezdett körre (a régi azonosító a kezdés idejétől függ); az el nem kezdett körről még semmi nem ment ki.
 */
export type NonceStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export const nonceAliasKeyOf = (storageKey: string, round: RoundLike) => `${storageKey}:nonce:${legacyRoundIdOf(round)}`;
export function rememberRoundNonce(store: NonceStore, storageKey: string, round: RoundLike): void {
  if (!round.nonce || !ROUND_NONCE.test(round.nonce) || !(round.startedAt > 0)) return;
  const key = nonceAliasKeyOf(storageKey, round);
  if (store.getItem(key) !== round.nonce) store.setItem(key, round.nonce);
}
export function recoverRoundNonce<T extends RoundLike>(store: NonceStore, storageKey: string, round: T): T {
  if ((round.nonce && ROUND_NONCE.test(round.nonce)) || !(round.startedAt > 0)) return round;
  const nonce = store.getItem(nonceAliasKeyOf(storageKey, round));
  return nonce && ROUND_NONCE.test(nonce) ? { ...round, nonce } : round;
}
/**
 * Review #613 (Copilot): a tartós sor bejegyzésének ELSŐDLEGES jelzője a RÉGI azonosítóé — a még nyitott B7-es ürítő siker után csak az
 * `entry.flag`-et írja, és ez így a régi kliens „elküldve” jelzője is (nonce-vesztés után sem küld újra); az új azonosító jelzője
 * az `alsoFlags`-ben. A bejegyzés kulcsa is ehhez igazodik (a B7-es ugyanarra a körre ugyanazt a kulcsot képzi).
 */
export function outboxFlagsOf(storageKey: string, kind: string, round: RoundLike): { flag: string; alsoFlags: string[] } {
  const flag = `${storageKey}:${kind}:sent:${legacyRoundIdOf(round)}`;
  return { flag, alsoFlags: sentFlagsOf(storageKey, kind, round).filter(f => f !== flag) };
}
/** Review #613: a szervernek küldött régi azonosító (ha eltér) — a szerver így a két azonosítót egy logikai körként kezeli. */
export function legacyRoundIdField(round: RoundLike): { legacyRoundId?: string } {
  const legacy = legacyRoundIdOf(round);
  return roundIdOf(round) !== legacy ? { legacyRoundId: legacy } : {};
}
/** 128 bites véletlen nonce (32 kisbetűs hexa jegy). */
export function newRoundNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
