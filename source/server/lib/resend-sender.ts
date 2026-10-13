/**
 * RESEND_FROM_EMAIL validation (spec: docs/specs/2026-10-13-resend-sandbox-or.md).
 *
 * The Resend sandbox sender (`…@resend.dev`) only delivers to the Resend account owner's own
 * address — every other recipient gets a 403. In 2026-09 this value reached production and all
 * notifications failed silently while the diagnostics panel showed "OK". Pure, no DB/network.
 */

export const RESEND_SANDBOX_DOMAIN = "resend.dev";

// local@label.label… — each domain label: letters/digits/hyphen, no leading/trailing hyphen.
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const ADDRESS_RE = new RegExp(`^[^\\s@<>"]+@${LABEL}(?:\\.${LABEL})+$`);
// The WHOLE value must be `addr` or `[display name] <addr>` — nothing after the closing bracket.
const NAME_ADDR_RE = /^(?:[^<>]*?\s*)?<([^<>]*)>$/;

/** `Name <addr@domain>` or `addr@domain` → lower-cased address, or null when malformed. */
export function extractSenderAddress(from: string): string | null {
  const trimmed = from.trim();
  const named = trimmed.match(NAME_ADDR_RE);
  if (!named && /[<>]/.test(trimmed)) return null;
  const address = (named ? named[1] : trimmed).trim().toLowerCase();
  return ADDRESS_RE.test(address) ? address : null;
}

export function checkResendSender(from: string): { ok: true } | { ok: false; reason: string } {
  const address = extractSenderAddress(from);
  if (!address) {
    return { ok: false, reason: "RESEND_FROM_EMAIL érvénytelen (pl. WEBSULI <noreply@websuli.vip>)" };
  }
  const domain = address.slice(address.lastIndexOf("@") + 1);
  if (domain === RESEND_SANDBOX_DOMAIN || domain.endsWith(`.${RESEND_SANDBOX_DOMAIN}`)) {
    return {
      ok: false,
      reason:
        "RESEND_FROM_EMAIL a Resend teszt-feladója (resend.dev) — csak a fiók saját címére kézbesít. " +
        "Állítsd hitelesített domainre: WEBSULI <noreply@websuli.vip>",
    };
  }
  return { ok: true };
}
