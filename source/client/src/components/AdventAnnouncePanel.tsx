import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

/**
 * S8 — adventi értesítő levél (tulajdonosi döntés 2026-11-28): előbb száraz futás (címzettszám forrásonként + a levél előnézete),
 * csak utána küldés — a száraz futás darabszámával megerősítve. E-mail-cím a felületen nem jelenik meg.
 */
type Dry = { dryRun: true; recipients: number; bySource: { subscription: number; extra: number }; alreadySent: number; subject: string; html: string };
type Sent = { dryRun: false; sent: number; failed: number; skipped: number };

export default function AdventAnnouncePanel() {
  const [dry, setDry] = useState<Dry | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setBusy(true); setError(null); setSent(null);
    try { setDry(await apiRequest<Dry>("POST", "/api/admin/advent/announce", { dryRun: true })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!dry) return;
    if (!window.confirm(`Biztosan elküldöd az adventi értesítőt ${dry.recipients} címzettnek?`)) return;
    setBusy(true); setError(null);
    try { setSent(await apiRequest<Sent>("POST", "/api/admin/advent/announce", { dryRun: false, confirmCount: dry.recipients })); setDry(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Card data-testid="advent-announce-panel">
      <CardHeader>
        <CardTitle className="text-base">Adventi értesítő levél</CardTitle>
        <CardDescription>Címzettek: a hírlevélre feliratkozottak és a külön felvett címek (a játékosfiókok soha). Előbb előnézet, utána küldés.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void preview()} data-testid="advent-announce-preview">Előnézet és címzettszám</Button>
        {dry ? (
          <div className="space-y-2" data-testid="advent-announce-dry">
            <p className="text-sm">
              <strong>{dry.recipients}</strong> címzett (feliratkozó: {dry.bySource.subscription}, külön cím: {dry.bySource.extra})
              {dry.alreadySent ? ` · már megkapta: ${dry.alreadySent} (nem kap újra)` : ""}
            </p>
            <p className="text-sm">Tárgy: <strong>{dry.subject}</strong></p>
            <iframe title="A levél előnézete" sandbox="" srcDoc={dry.html} className="w-full h-72 border rounded" data-testid="advent-announce-html" />
            <Button type="button" disabled={busy || dry.recipients === 0} onClick={() => void send()} data-testid="advent-announce-send">
              Küldés {dry.recipients} címzettnek
            </Button>
          </div>
        ) : null}
        {sent ? <p className="text-sm" data-testid="advent-announce-result">Elküldve: {sent.sent} · hiba: {sent.failed} · már megkapta: {sent.skipped}</p> : null}
        {error ? <p className="text-sm text-destructive" data-testid="advent-announce-error">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
