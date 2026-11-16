/**
 * JM7b — admin „Játékosok” fül (terv 10.4 „Tiltás”): a játékos-fiókok listája becenévvel, MASZKOLT e-mail-címmel,
 * létrehozással, utolsó belépéssel és tiltási állapottal; tiltás / feloldás (a már belépett játékosra azonnal hat).
 * A teljes cím csak külön gombnyomásra töltődik le (admin-végpont), és csak ezen a képernyőn látszik.
 * A becenév szövegként jelenik meg (React-szövegcsomópont).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Eye, Gamepad2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AdminPlayer = {
  id: string; nickname: string | null; avatar: string | null; maskedEmail: string; createdAt: string; lastSeenAt: string | null;
  banned: boolean; bannedAt: string | null; googleLinked: boolean; learnerLinked: boolean;
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "short", timeStyle: "short" }) : "—");

export default function PlayersPanel() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const key = ["/api/admin/game-accounts", search] as const;
  const { data, isLoading, isError } = useQuery<{ players: AdminPlayer[] }>({
    queryKey: key,
    queryFn: () => apiRequest("GET", `/api/admin/game-accounts${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  });

  const toggleBan = useMutation({
    mutationFn: (p: AdminPlayer) => apiRequest("POST", `/api/admin/game-accounts/${encodeURIComponent(p.id)}/${p.banned ? "unban" : "ban"}`, {}),
    onSuccess: async (_r, p) => {
      toast({ title: p.banned ? "Tiltás feloldva" : "Játékos tiltva", description: p.nickname ?? "becenév nélküli fiók" });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/game-accounts"] });
    },
    onError: (e: Error) => toast({ title: "Nem sikerült", description: e.message, variant: "destructive" }),
  });

  const reveal = async (p: AdminPlayer) => {
    try {
      const r = await apiRequest<{ email: string }>("GET", `/api/admin/game-accounts/${encodeURIComponent(p.id)}/email`);
      setRevealed((m) => ({ ...m, [p.id]: r.email }));
    } catch (e) {
      toast({ title: "Nem sikerült", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const players = data?.players ?? [];
  return (
    <Card data-testid="players-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gamepad2 className="h-5 w-5" /> Játékosok</CardTitle>
        <CardDescription>A játékokhoz regisztrált diákok (külön fiók, admin-joguk nincs). Más játékos csak a becenevet és az avatart látja.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keresés becenévre" maxLength={64} data-testid="input-players-search" />
          <Button type="submit" variant="secondary" className="gap-1"><Search className="h-4 w-4" /> Keresés</Button>
        </form>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : isError ? (
          <p className="text-sm text-destructive" role="alert">A játékosok listája nem tölthető be.</p>
        ) : players.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="players-empty">Még nincs regisztrált játékos.</p>
        ) : (
          <ul className="divide-y rounded-md border" data-testid="players-list">
            {players.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3" data-testid={`player-row-${p.id}`}>
                <PlayerAvatar avatarKey={p.avatar} seed={p.id} size={40} />
                <div className="min-w-[12rem] flex-1">
                  <p className="break-words font-semibold">
                    {p.nickname ?? <span className="italic text-muted-foreground">nincs becenév</span>}
                    {p.banned && <Badge variant="destructive" className="ml-2">Tiltva</Badge>}
                    {p.googleLinked && <Badge variant="outline" className="ml-2">Google</Badge>}
                    {p.learnerLinked && <Badge variant="outline" className="ml-2">Tanuló</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono" data-testid="player-email">{revealed[p.id] ?? p.maskedEmail}</span>
                    {" · "}létrehozva: {fmt(p.createdAt)} · utoljára: {fmt(p.lastSeenAt)}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  {!revealed[p.id] && (
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => void reveal(p)} title="A teljes e-mail-cím megjelenítése (csak adminnak)">
                      <Eye className="h-4 w-4" /> Cím
                    </Button>
                  )}
                  <Button size="sm" variant={p.banned ? "secondary" : "destructive"} className="gap-1" disabled={toggleBan.isPending}
                    onClick={() => toggleBan.mutate(p)} data-testid={`button-player-ban-${p.id}`}>
                    {p.banned ? <><RotateCcw className="h-4 w-4" /> Feloldás</> : <><Ban className="h-4 w-4" /> Tiltás</>}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
