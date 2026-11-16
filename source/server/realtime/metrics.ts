/**
 * JM2 — a valós idejű réteg számlálói (végrehajtás JM2 9–10. lépés; terv 10.8 „Telepítés-őr”, kutatás 3.7).
 * Csak számok: szobakód-hash, játékosszám, okkód — név, e-mail, IP, szobakód nyíltan soha nem kerül ide vagy a naplóba.
 */
import { createHash } from "node:crypto";

export function roomHash(code: string): string {
  return createHash("sha256").update(`rt-room:${code}`).digest("hex").slice(0, 10);
}

export function createMetrics() {
  const rejected = new Map<string, number>();
  const counters = { connections: 0, handshakesOk: 0, messagesIn: 0, roomsCreated: 0, matchesStarted: 0, matchesFinished: 0, matchesAborted: 0 };
  return {
    counters,
    reject(code: string): void {
      rejected.set(code, (rejected.get(code) ?? 0) + 1);
    },
    rejectedSnapshot(): Record<string, number> {
      return Object.fromEntries(rejected);
    },
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
