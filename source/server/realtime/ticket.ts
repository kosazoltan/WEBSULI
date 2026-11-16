/**
 * JM2 — rövid életű, egyszer használatos, aláírt belépőjegy a valós idejű réteghez (terv 10.3 6. pont, 10.9;
 * végrehajtás JM2 4. lépés).
 *
 * Alak: `<base64url(JSON törzs)>.<base64url(HMAC-SHA256)>`; a kulcs `HMAC(SESSION_SECRET, "rt-ticket-v1")` (a tanulói
 * token mintája szerint külön levezetett kulcs). A törzs: szerep (`create` / `join` + szobakód), megjelenítendő becenév,
 * avatar, ajánlott évfolyam, a szerver-oldali azonosság kulcsa (`sub` — nem megy ki más játékosnak), lejárat (≤ 60 s) és
 * egy véletlen `nonce`. Az egyszer-használatot a memóriabeli nonce-halmaz adja: az ellenőrzés és a felhasználás egyetlen
 * szinkron lépés (Node egy szálon fut → atomikus), a halmaz a lejárat után kiürül.
 * A jegy SOHA nem kerül URL-be: a kliens a Socket.IO `auth` mezőjében küldi.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { RT_TICKET_TTL_MS } from "../../shared/duel/protocol";

export type TicketKind = "guest" | "learner" | "player" | "user" | "admin";
export type TicketIntent = { kind: "create"; code: null } | { kind: "join"; code: string };

export type TicketClaims = {
  v: 1;
  /** A belépés jogcíme (csak a szerver használja; a szobában senkinek nem ad jogot). */
  kind: TicketKind;
  /** Szerveroldali azonosság-kulcs (egy játékos egy szobában); pl. `guest:<véletlen>`, `player:<hash>`. */
  sub: string;
  nickname: string;
  avatar: string | null;
  /** Ajánlott évfolyam (tanulói profilból), különben null. */
  grade: number | null;
  intent: TicketIntent;
  exp: number;
  nonce: string;
};

export type TicketVerifyResult = { ok: true; claims: TicketClaims } | { ok: false; reason: "MALFORMED" | "SIGNATURE" | "EXPIRED" | "REUSED" };

/** A jegy-kulcs forrása: SESSION_SECRET (élesben kötelező); fejlesztésben / tesztben rögzített kulcs. */
export function ticketSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  return env.NODE_ENV === "production" ? null : "websuli-dev-rt-ticket";
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function createTicketService(opts: { secret: string; now?: () => number; ttlMs?: number }) {
  const key = createHmac("sha256", opts.secret).update("rt-ticket-v1").digest();
  const now = opts.now ?? Date.now;
  const ttlMs = Math.min(opts.ttlMs ?? RT_TICKET_TTL_MS, RT_TICKET_TTL_MS);
  /** Felhasznált nonce → lejárat; a lejárt bejegyzés törölhető (a jegy úgyis érvénytelen). */
  const used = new Map<string, number>();

  const sign = (body: string) => createHmac("sha256", key).update(body).digest();

  function purge(at: number) {
    for (const [nonce, exp] of used) if (exp < at) used.delete(nonce);
  }

  return {
    ttlMs,
    issue(claims: Omit<TicketClaims, "v" | "exp" | "nonce">): { ticket: string; expiresAt: number } {
      const exp = now() + ttlMs;
      const full: TicketClaims = { v: 1, ...claims, exp, nonce: randomBytes(16).toString("base64url") };
      const body = b64(JSON.stringify(full));
      return { ticket: `${body}.${b64(sign(body))}`, expiresAt: exp };
    },
    /** Ellenőrzés ÉS felhasználás egy lépésben: sikeres hívás után ugyanaz a jegy többé nem érvényes. */
    consume(ticket: unknown): TicketVerifyResult {
      if (typeof ticket !== "string" || ticket.length > 1024) return { ok: false, reason: "MALFORMED" };
      const parts = ticket.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "MALFORMED" };
      const expected = sign(parts[0]);
      const given = Buffer.from(parts[1], "base64url");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "SIGNATURE" };
      let claims: TicketClaims;
      try {
        claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as TicketClaims;
      } catch {
        return { ok: false, reason: "MALFORMED" };
      }
      if (!claims || claims.v !== 1 || typeof claims.nonce !== "string" || typeof claims.exp !== "number") return { ok: false, reason: "MALFORMED" };
      const at = now();
      if (claims.exp <= at) return { ok: false, reason: "EXPIRED" };
      purge(at);
      if (used.has(claims.nonce)) return { ok: false, reason: "REUSED" };
      used.set(claims.nonce, claims.exp);
      return { ok: true, claims };
    },
    /** Tesztekhez / státuszhoz: a nyilvántartott (még nem lejárt) felhasznált jegyek száma. */
    usedCount(): number {
      purge(now());
      return used.size;
    },
  };
}

export type TicketService = ReturnType<typeof createTicketService>;
