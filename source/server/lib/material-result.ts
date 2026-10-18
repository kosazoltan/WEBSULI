import { createHash } from 'node:crypto';

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
const AUTO_SUFFIX = ' — automatikus';

/**
 * Ismétlésvédelem kulcsa: azonos anyag + kliens + törzs 10 percen belül csak egyszer küld. A kliens az oldalbetöltésenkénti
 * `clientId` (review #281: egy iskolai NAT mögötti két tanuló azonos eredménye nem duplikátum); hiányában az IP.
 */
export function materialResultDedupKey(payload: MaterialResultPayload, clientIp: string): string {
  return createHash('sha256').update(`${payload.materialId}|${clientIp}|${payload.clientId ?? ''}|${payload.subject}|${payload.body}`).digest('hex');
}

export interface MaterialResultPayload {
  materialId: string;
  subject: string;
  body: string;
  /** Régi anyag automatikus beolvasása (docs/specs/2026-10-17-regi-anyag-eredmeny.md) — a tárgyban jelölve. */
  auto?: boolean;
  /** Oldalbetöltésenkénti véletlen azonosító (nem személyes adat) — csak az ismétlésvédelemhez. */
  clientId?: string;
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
  if (r.auto !== undefined && typeof r.auto !== 'boolean') {
    return { ok: false, error: 'Érvénytelen jelölés' };
  }
  if (r.clientId !== undefined && (typeof r.clientId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(r.clientId))) {
    return { ok: false, error: 'Érvénytelen kliensazonosító' };
  }
  return { ok: true, value: { materialId, subject, body, ...(r.auto ? { auto: true } : {}), ...(typeof r.clientId === 'string' ? { clientId: r.clientId } : {}) } };
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
  const subject = `[WebSuli eredmény] ${payload.subject}`.slice(0, payload.auto ? 200 - AUTO_SUFFIX.length : 200);
  return { subject: payload.auto ? subject + AUTO_SUFFIX : subject, html };
}

/**
 * Címzettenkénti kézbesítés ismétlésvédelemmel (review #281): a már értesített admin nem kap újra; a kimaradt címzett egyszeri
 * pótlása a `scheduleRetry`-ban fut, és ha az is hibázik, a kulcsa törlődik — így egy ismételt beküldés csak neki küld, és nem
 * kap hamis „duplicate” választ.
 */
export async function deliverToRecipients(opts: {
  recipients: readonly string[];
  baseKey: string;
  dedup: { shouldRecord(key: string): boolean; forget(key: string): void };
  send: (to: string) => Promise<boolean>;
  scheduleRetry: (run: () => Promise<void>) => void;
  onRetryDone?: (stillFailed: number) => void;
}): Promise<{ duplicate: true } | { duplicate: false; delivered: number; failed: string[] }> {
  const keyOf = (to: string) => `${opts.baseKey}|${to}`;
  const pending = opts.recipients.filter((to) => opts.dedup.shouldRecord(keyOf(to)));
  if (pending.length === 0) return { duplicate: true };
  const sendAll = async (list: readonly string[]) => {
    const settled = await Promise.allSettled(list.map((to) => opts.send(to)));
    return list.filter((_, i) => !(settled[i].status === 'fulfilled' && settled[i].value));
  };
  const failed = await sendAll(pending);
  const delivered = pending.length - failed.length;
  if (delivered === 0) {
    failed.forEach((to) => opts.dedup.forget(keyOf(to)));
  } else if (failed.length > 0) {
    opts.scheduleRetry(async () => {
      const stillFailed = await sendAll(failed);
      stillFailed.forEach((to) => opts.dedup.forget(keyOf(to)));
      opts.onRetryDone?.(stillFailed.length);
    });
  }
  return { duplicate: false, delivered, failed };
}

/**
 * Szerveres összevárás (docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md): a régi anyag minden új eredményállapotot azonnal
 * beküld (különben a keret eltávolításakor elveszne), a levél viszont kulcsonként (anyag + kliens) csak egyszer megy, a legutolsó
 * állapottal — `quietMs` nyugalom után, folyamatos tevékenységnél legkésőbb `maxWaitMs`-mal az első beküldés után.
 * Review #300: a sikertelen kézbesítés (`deliver` → false vagy kivétel) korlátozottan újrapróbál, de a közben érkezett frissebb
 * állapotot nem írja felül; a sikeres közvetlen küldés után a kulcs `suppressMs`-ig letiltva marad (a később beérkező automatikus
 * beküldés sem küld második levelet); a leállítás a folyamatban lévő kézbesítéseket is megvárja.
 */
export class ResultCoalescer<T> {
  private readonly pending = new Map<string, { payload: T; first: number; timer: unknown; attempts: number }>();
  private readonly suppressed = new Map<string, number>();
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly opts: {
    deliver: (payload: T) => Promise<boolean>;
    quietMs?: number;
    maxWaitMs?: number;
    retryMs?: number;
    maxAttempts?: number;
    suppressMs?: number;
    now?: () => number;
    setTimer?: (run: () => void, ms: number) => unknown;
    clearTimer?: (timer: unknown) => void;
  }) {}

  private now(): number { return (this.opts.now ?? Date.now)(); }
  private clear(timer: unknown): void { (this.opts.clearTimer ?? ((t: unknown) => clearTimeout(t as NodeJS.Timeout)))(timer); }
  private schedule(run: () => void, ms: number): unknown {
    return (this.opts.setTimer ?? ((r: () => void, d: number) => { const t = setTimeout(r, d); t.unref?.(); return t; }))(run, ms);
  }

  /** false: a kulcs letiltva (a tanuló közvetlenül már elküldte), a beküldés nem kerül sorba. */
  submit(key: string, payload: T): boolean {
    const now = this.now();
    const until = this.suppressed.get(key);
    if (until !== undefined && until > now) return false;
    if (until !== undefined) this.suppressed.delete(key);
    const quiet = this.opts.quietMs ?? 30_000;
    const maxWait = this.opts.maxWaitMs ?? 180_000;
    const prev = this.pending.get(key);
    if (prev) this.clear(prev.timer);
    const first = prev?.first ?? now;
    const delay = Math.max(0, Math.min(quiet, first + maxWait - now));
    const timer = this.schedule(() => { void this.fire(key); }, delay);
    this.pending.set(key, { payload, first, timer, attempts: 0 });
    return true;
  }

  get size(): number { return this.pending.size; }

  /** A sikeres közvetlen (mailto) küldés után: a függő automatikus levél törlődik, és a kulcs `suppressMs`-ig letiltva marad. */
  suppress(key: string): void {
    const entry = this.pending.get(key);
    if (entry) { this.clear(entry.timer); this.pending.delete(key); }
    this.suppressed.set(key, this.now() + (this.opts.suppressMs ?? 10 * 60_000));
    if (this.suppressed.size > 5000) {
      const now = this.now();
      for (const [k, until] of this.suppressed) if (until <= now) this.suppressed.delete(k);
    }
  }

  /** Minden függő levél azonnal, és a már folyamatban lévők megvárása (leállításkor). */
  async flushAll(): Promise<void> {
    const fired = [...this.pending.keys()].map((key) => this.fire(key, true));
    await Promise.all([...fired, ...this.inFlight]);
  }

  private fire(key: string, final = false): Promise<void> {
    const entry = this.pending.get(key);
    if (!entry) return Promise.resolve();
    this.clear(entry.timer);
    this.pending.delete(key);
    const run = (async () => {
      const ok = await this.opts.deliver(entry.payload).catch(() => false);
      // sikertelen kézbesítés: korlátozott újrapróba, ha közben nem jött frissebb állapot és a kulcs nem lett letiltva
      if (ok || final || this.pending.has(key) || entry.attempts + 1 >= (this.opts.maxAttempts ?? 3)) return;
      const until = this.suppressed.get(key);
      if (until !== undefined && until > this.now()) return;
      const timer = this.schedule(() => { void this.fire(key); }, this.opts.retryMs ?? 60_000);
      this.pending.set(key, { ...entry, timer, attempts: entry.attempts + 1 });
    })();
    this.inFlight.add(run);
    void run.finally(() => this.inFlight.delete(run));
    return run;
  }
}
