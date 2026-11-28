/**
 * S8 — adventi értesítő levél (docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md S8 + Kiegészítés 4–5; tulajdonosi döntés 2026-11-28:
 * „előbb mutasd meg a címzettek számát és a levél szövegét, csak utána küldd”).
 *
 * - Címzettek: CSAK az aktív hírlevél-feliratkozók (`email_subscriptions`) és az aktív külön címek (`extra_email_addresses`); a
 *   `player_accounts` és a `users` tábla soha. Kisbetűsítés, `trim`, ismétlődés-szűrés.
 * - Száraz futás: darabszám forrásonként + tárgy + HTML — e-mail-cím nélkül; nem ír, nem küld.
 * - Éles küldés: `confirmCount` a száraz futás darabszáma (eltérésnél 409); címzettenként foglalás az `advent_announcements`-ben
 *   (`recipient_hash` = HMAC-SHA-256 a szerver titkával, a cím nem tárolódik), idempotencia-kulcs a szolgáltatónak, 10-es kötegek.
 *   Kétszeri küldés nem dupláz (az elküldött sor foglalt marad; a hibás sor újrapróbálható).
 */
import { createHmac } from "node:crypto";
import { adventAnnounceEmail } from "../../shared/advent/announce-email";

export type AnnounceSource = "subscription" | "extra";
export type AnnounceRecipient = { email: string; source: AnnounceSource };
export type AnnounceQuery = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }> };

export type AnnounceDeps = {
  db: AnnounceQuery;
  recipients: () => Promise<{ subscriptions: Array<string | null | undefined>; extras: Array<string | null | undefined> }>;
  send: (to: string, subject: string, html: string, idempotencyKey: string) => Promise<void>;
  secret: () => string | null;
  season: number;
  baseUrl: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ANNOUNCE_BATCH = 10;

export function collectAnnounceRecipients(input: { subscriptions: Array<string | null | undefined>; extras: Array<string | null | undefined> }) {
  const seen = new Set<string>();
  const list: AnnounceRecipient[] = [];
  const bySource = { subscription: 0, extra: 0 };
  const add = (raw: string | null | undefined, source: AnnounceSource) => {
    const email = (raw ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) return;
    seen.add(email);
    list.push({ email, source });
    bySource[source]++;
  };
  input.subscriptions.forEach((e) => add(e, "subscription"));
  input.extras.forEach((e) => add(e, "extra"));
  return { list, bySource };
}

export function announceRecipientHash(secret: string, email: string): string {
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

export type AnnounceResult =
  | { status: 200; dryRun: true; recipients: number; bySource: { subscription: number; extra: number }; alreadySent: number; subject: string; html: string }
  | { status: 200; dryRun: false; sent: number; failed: number; skipped: number }
  | { status: 409; error: string; recipients: number }
  | { status: 503; error: string };

export async function announceAdvent(deps: AnnounceDeps, opts: { dryRun: boolean; confirmCount?: number }): Promise<AnnounceResult> {
  const secret = deps.secret();
  if (!secret) return { status: 503, error: "A szerver titka hiányzik — a küldés nem indítható." };
  const { list, bySource } = collectAnnounceRecipients(await deps.recipients());
  const { subject, html } = adventAnnounceEmail({ season: deps.season, baseUrl: deps.baseUrl });
  if (opts.dryRun) {
    const sent = await deps.db.query("SELECT recipient_hash FROM advent_announcements WHERE season = $1 AND status = 'sent'", [deps.season]);
    const sentHashes = new Set(sent.rows.map((r) => String(r.recipient_hash)));
    const alreadySent = list.filter((r) => sentHashes.has(announceRecipientHash(secret, r.email))).length;
    return { status: 200, dryRun: true, recipients: list.length, bySource, alreadySent, subject, html };
  }
  if (opts.confirmCount !== list.length) {
    return { status: 409, error: "A címzettek száma megváltozott — futtasd újra az előnézetet.", recipients: list.length };
  }
  let sent = 0, failed = 0, skipped = 0;
  for (let i = 0; i < list.length; i += ANNOUNCE_BATCH) {
    await Promise.all(list.slice(i, i + ANNOUNCE_BATCH).map(async (r) => {
      const hash = announceRecipientHash(secret, r.email);
      // Foglalás: új sor, vagy egy korábban HIBÁS sor újranyitása; az elküldött / folyamatban lévő sor nem foglalható újra.
      const claim = await deps.db.query(
        `INSERT INTO advent_announcements (season, recipient_hash, source, status) VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (season, recipient_hash) DO UPDATE SET status = 'pending', updated_at = now()
           WHERE advent_announcements.status = 'failed'
         RETURNING id`, [deps.season, hash, r.source]);
      if (!claim.rows.length) { skipped++; return; }
      try {
        await deps.send(r.email, subject, html, `advent-announce/${deps.season}/${hash.slice(0, 32)}`);
        await deps.db.query("UPDATE advent_announcements SET status = 'sent', updated_at = now() WHERE id = $1", [claim.rows[0]!.id]);
        sent++;
      } catch {
        await deps.db.query("UPDATE advent_announcements SET status = 'failed', updated_at = now() WHERE id = $1", [claim.rows[0]!.id]);
        failed++;
      }
    }));
  }
  return { status: 200, dryRun: false, sent, failed, skipped };
}
