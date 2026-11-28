/**
 * S8 — az adventi értesítő küldője. Tesztben (`NODE_ENV=test`) és e2e-módban VALÓDI levél nem mehet ki: ott csak a
 * `setAdventAnnounceSender`-rel beállított hamis küldő fut; ha nincs beállítva, a küldés hibát dob (a sor `failed` lesz).
 */
import { sendAdminNotification } from "../resend";
import { isE2eMode } from "../lib/e2e-mode";

export type AnnounceSender = (to: string, subject: string, html: string, idempotencyKey: string) => Promise<void>;
let override: AnnounceSender | null = null;

export function setAdventAnnounceSender(sender: AnnounceSender | null): void {
  override = sender;
}

export function adventAnnounceSender(env: NodeJS.ProcessEnv = process.env): AnnounceSender {
  if (override) return override;
  if (env.NODE_ENV === "test" || isE2eMode(env)) {
    return async () => { throw new Error("Tesztben / e2e-módban valódi értesítő levél nem küldhető"); };
  }
  return async (to, subject, html, idempotencyKey) => {
    await sendAdminNotification(subject, html, to, { quiet: true, idempotencyKey });
  };
}
