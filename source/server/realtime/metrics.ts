/**
 * JM2 — a valós idejű réteg számlálói (végrehajtás JM2 9–10. lépés; terv 10.8 „Telepítés-őr”, kutatás 3.7).
 * Csak számok: szobakód-hash, játékosszám, okkód — név, e-mail, IP, szobakód nyíltan soha nem kerül ide vagy a naplóba.
 */
import { createHmac, randomBytes } from "node:crypto";

/**
 * Kulcsolt szobakód-hash a naplóhoz (review #452 ALACSONY-3): a kódtér kicsi (31⁶), egy só nélküli hash percek alatt
 * visszafejthető lenne. A kulcs a szerver-titokból levezetett (titok nélkül folyamatonként véletlen).
 */
export function createRoomHasher(secret: string | null): (code: string) => string {
  const key = createHmac("sha256", secret ?? randomBytes(32).toString("hex")).update("rt-room-log-v1").digest();
  return (code) => createHmac("sha256", key).update(code).digest("hex").slice(0, 12);
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
