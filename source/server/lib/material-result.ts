/**
 * BACKLOG T1 (2026-09-02) — tananyag-eredmény beküldés szerver-oldalon.
 *
 * Korábban a tananyag-HTML-be injektált `sendResultEmail()` egy `mailto:` linket nyitott,
 * amelyben az összes admin e-mail cím szó szerint benne volt — a publikus /dev/:id HTML-ből
 * bárki kiolvashatta. Most a tananyag a `POST /api/material-result` végpontot hívja, a
 * címzetteket a szerver oldja fel. Ez a modul a tiszta (DB/hálózat nélküli) része:
 * payload-validálás, címzett-lista, levél-törzs.
 */

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 5000;
export const MAX_MATERIAL_ID_LENGTH = 64;

export interface MaterialResultPayload {
  materialId: string;
  subject: string;
  body: string;
}

export type MaterialResultValidation =
  | { ok: true; value: MaterialResultPayload }
  | { ok: false; error: string };

// vezérlőkarakterek (kivéve \t \n \r) — fejléc-injection és log-szemét ellen
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.replace(CONTROL_CHARS, '').trim();
}

/** Validálja és normalizálja a tananyag által küldött eredmény-payloadot. */
export function normalizeMaterialResult(raw: unknown): MaterialResultValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Hiányzó kérés-törzs' };
  const r = raw as Record<string, unknown>;
  const materialId = asTrimmedString(r.materialId) ?? '';
  const subject = asTrimmedString(r.subject) ?? '';
  const body = asTrimmedString(r.body) ?? '';

  if (!materialId || materialId.length > MAX_MATERIAL_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(materialId)) {
    return { ok: false, error: 'Érvénytelen tananyag-azonosító' };
  }
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, error: `A tárgy kötelező, legfeljebb ${MAX_SUBJECT_LENGTH} karakter` };
  }
  if (body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: `Az üzenet legfeljebb ${MAX_BODY_LENGTH} karakter lehet` };
  }
  return { ok: true, value: { materialId, subject, body } };
}

/** ADMIN_EMAILS (vesszővel elválasztva) vagy ADMIN_EMAIL → egyedi, érvényes címek. */
export function resolveAdminRecipients(env: { ADMIN_EMAILS?: string; ADMIN_EMAIL?: string }): string[] {
  const raw = env.ADMIN_EMAILS || env.ADMIN_EMAIL || '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Az adminnak küldött levél HTML-törzse — minden mező escape-elve. */
export function buildMaterialResultEmail(
  payload: MaterialResultPayload,
  materialTitle: string | null | undefined,
  previewUrl: string,
): { subject: string; html: string } {
  const title = materialTitle ? escapeHtml(materialTitle) : escapeHtml(payload.materialId);
  const bodyHtml = escapeHtml(payload.body).replace(/\r?\n/g, '<br>');
  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">',
    `<p><strong>Tananyag:</strong> ${title}</p>`,
    `<p><strong>Tárgy:</strong> ${escapeHtml(payload.subject)}</p>`,
    `<p style="white-space:pre-wrap">${bodyHtml || '<em>(üres üzenet)</em>'}</p>`,
    `<p style="color:#666;font-size:12px">Forrás: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p>`,
    '</div>',
  ].join('');
  return { subject: `[WebSuli eredmény] ${payload.subject}`, html };
}
