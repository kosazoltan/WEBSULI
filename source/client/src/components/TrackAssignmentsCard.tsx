import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRACKS } from "@shared/tracks";

type Assignment = { track: string; emailKey: string; createdAt?: string };
const KEY = ["/api/admin/track-assignments"];

/**
 * Csoport-hozzárendelések (#1986; tulajdonosi döntés 2026-11-24): melyik fiók lássa kiemelve egy külön tananyagcsoportot
 * (pl. „6-osztályos gimnáziumi felvételi”). A cím a fiókkulcsra normalizálva kerül az adatbázisba — a repóban nincs cím.
 */
export function TrackAssignmentsCard() {
  const [track, setTrack] = useState<string>(TRACKS[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: rows = [], isLoading } = useQuery<Assignment[]>({ queryKey: KEY });
  const add = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/track-assignments", { track, email }),
    onSuccess: () => { setEmail(""); setError(null); queryClient.invalidateQueries({ queryKey: KEY }); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "A mentés nem sikerült"),
  });
  const remove = useMutation({
    mutationFn: async (a: Assignment) => apiRequest("DELETE", "/api/admin/track-assignments", { track: a.track, emailKey: a.emailKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const label = (id: string) => TRACKS.find((t) => t.id === id)?.label ?? id;

  return (
    <section className="rounded-lg border border-orange-200 dark:border-orange-900 bg-white dark:bg-slate-900 p-3 space-y-3" data-testid="track-assignments-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-amber-500" aria-hidden="true" />Csoport-hozzárendelések</h3>
      <p className="text-xs text-muted-foreground">A megadott fióknál a csoport a főoldalon kiemelve, „Neked” jelzéssel jelenik meg. Gmail-címnél a pontok és a +címke nem számítanak.</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(); }}
      >
        <label className="sr-only" htmlFor="track-assign-track">Csoport</label>
        <select id="track-assign-track" value={track} onChange={(e) => setTrack(e.target.value)} className="h-9 rounded-md border px-2 text-sm bg-background" data-testid="select-track-assign">
          {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="track-assign-email">E-mail-cím</label>
        <Input id="track-assign-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tanulo@pelda.hu" className="h-9 w-64" data-testid="input-track-assign-email" />
        <Button type="submit" size="sm" disabled={!email.trim() || add.isPending} data-testid="button-track-assign-add">Hozzárendelés</Button>
      </form>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {isLoading ? <p className="text-xs text-muted-foreground">Betöltés…</p> : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="track-assign-empty">Még nincs hozzárendelés.</p>
      ) : (
        <ul className="divide-y text-sm" data-testid="track-assign-list">
          {rows.map((a) => (
            <li key={`${a.track}|${a.emailKey}`} className="flex items-center justify-between gap-2 py-1.5" data-testid="track-assign-row">
              <span><span className="font-medium">{label(a.track)}</span> — {a.emailKey}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Hozzárendelés törlése: ${a.emailKey}`} onClick={() => remove.mutate(a)} data-testid="button-track-assign-remove">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
