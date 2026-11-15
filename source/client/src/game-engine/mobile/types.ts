/**
 * S2 — a közös mobilos játékkeret típusai (docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md K.7.3).
 */

export type GameOrientation = "portrait" | "landscape";
export type GameOrientationPreference = "any" | GameOrientation;
export type GameScreenState = "start" | "playing" | "paused" | "result";

/** A `localStorage` azon része, amit a keret használ (tesztben memória-tárolóval pótolható). */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
