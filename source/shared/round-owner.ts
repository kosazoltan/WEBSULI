/**
 * Eredmény-e-mail B4b (#510 R47 kliens, R49 b, R50 — „Kilét-invariáns”): a kör PÁROSÍTÁSI kiléte a kör első tevékenységekor rögzül, és
 * küldéskor nem oldódik fel újra. A rekord a párosító token LENYOMATÁT tárolja (nem a titkot); a mostani token minden tényleges kérés előtt
 * ehhez vetődik, eltérésnél (újrapárosítás, kilépés) a kérés párosítás nélkül megy — a kör az új tanulónak nem tulajdonítható. A fiók
 * címkéje (R31) a szerveroldali támogatással együtt (B7) kerül ide. Tiszta modul: a tároló és a token-forrás befecskendezett (tesztelhető).
 */
import { sha256Hex } from "./sha256";

export type RoundOwner = { learnerTag: string | null };
/** PR #574 review: kriptográfiai erősségű tokenlenyomat (SHA-256, előtaggal); a korábbi rövid lenyomatú rekord ismeretlennek számít. */
export const learnerTagOf = (token: string) => `s256:${sha256Hex(`websuli-learner|${token}`)}`;
const TAG_SHAPE = /^s256:[0-9a-f]{64}$/;
type OwnerStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

type RoundShape = { picks: Record<string, number>; answers: Record<string, string>; sampleViewed?: readonly string[]; startedAt?: number };
/** Tevékenység: kvíz — van válasz; feladat — van nem üres válasz VAGY megnézett mintaválasz (PR #574 review). */
export function roundHasActivity(kind: "tasks" | "quiz", round: RoundShape): boolean {
  return kind === "quiz" ? Object.keys(round.picks).length > 0 : Object.values(round.answers).some(a => a.trim() !== "") || (round.sampleViewed?.length ?? 0) > 0;
}
/**
 * R50 (PR #574 review): a kör CSAK akkor friss, ha még el sem kezdődött (`startedAt === 0`) és nincs rajta tevékenység — a visszatöltött,
 * korábban megkezdett, majd kiürített kör nem friss (nem a válaszok ürességéből következtetünk).
 */
export function isFreshRound(kind: "tasks" | "quiz", round: RoundShape): boolean {
  return !(round.startedAt ?? 0) && !roundHasActivity(kind, round);
}

export function createRoundOwners(storage: () => OwnerStorage | null, currentToken: () => string | null, tagOf: (token: string) => string = learnerTagOf) {
  const memory = new Map<string, RoundOwner>();
  const read = (key: string): RoundOwner | null => {
    const known = memory.get(key);
    if (known) return known;
    try {
      const parsed = JSON.parse(storage()?.getItem(key) ?? "null") as Partial<RoundOwner> | null;
      if (parsed && (parsed.learnerTag === null || typeof parsed.learnerTag === "string")) {
        // a korábbi (rövid, ütközésre hajlamos) lenyomat ismeretlennek számít
        const owner = { learnerTag: parsed.learnerTag !== null && tagOf === learnerTagOf && !TAG_SHAPE.test(parsed.learnerTag) ? null : parsed.learnerTag };
        memory.set(key, owner);
        return owner;
      }
    } catch { /* olvashatatlan tároló / sérült érték: nincs rekord */ }
    return null;
  };
  return {
    /**
     * A kilét EGYETLEN keletkezési pontja: rögzít, ha még nincs rekord, és a rögzítettet adja. R50: a mostani kilét csak akkor rögzül, ha a
     * kör első tevékenysége bizonyíthatóan ebben a dokumentumban történt (`firstActivityHere`); különben ismeretlen (párosítás nélkül).
     */
    bind(key: string, firstActivityHere: boolean): RoundOwner {
      const existing = read(key);
      if (existing) return existing;
      const token = firstActivityHere ? currentToken() : null;
      const owner: RoundOwner = { learnerTag: token ? tagOf(token) : null };
      memory.set(key, owner);
      try { storage()?.setItem(key, JSON.stringify(owner)); } catch { /* a memóriabeli rekord marad */ }
      return owner;
    },
    /** R47 / R49 b: a mostani párosító token, ha a rögzített lenyomattal egyezik — különben nincs párosítás. */
    learnerFor(owner: RoundOwner): string | undefined {
      const token = currentToken();
      return token && owner.learnerTag !== null && tagOf(token) === owner.learnerTag ? token : undefined;
    },
    /** A végleges siker után. */
    clear(key: string): void {
      memory.delete(key);
      try { storage()?.removeItem(key); } catch { /* nincs mit törölni */ }
    },
  };
}
