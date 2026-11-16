/**
 * JM7b — admin „Játékosok” fül (terv 10.4 „Tiltás”): a játékos-fiókok listája becenévvel, MASZKOLT e-mail-címmel,
 * létrehozással, utolsó belépéssel és tiltási állapottal; tiltás / feloldás (a már belépett játékosra azonnal hat).
 * A teljes cím csak külön gombnyomásra töltődik le (admin-végpont), és csak ezen a képernyőn látszik.
 * A becenév szövegként jelenik meg (React-szövegcsomópont).
 * N2 (tulajdonosi döntés 2026-11-16): VÉGLEGES törlés megerősítő párbeszéddel (a beírt „TÖRLÉS” szó nélkül nem küldhető).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Eye, Gamepad2, RotateCcw, Search, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** K1: a törölt, de tiltva maradt fiók bejegyzése — cím és maszk nélkül. */
type DeletedBan = { ref: string; bannedAt: string; deletedAt: string };

type AdminPlayer = {
  id: string; nickname: string | null; avatar: string | null; maskedEmail: string; createdAt: string; lastSeenAt: string | null;
  banned: boolean; bannedAt: string | null; googleLinked: boolean; learnerLinked: boolean;
};

/** A szerver `ADMIN_DELETE_CONFIRM_WORD`-jével azonos (server/player/admin-routes.ts). */
const DELETE_WORD = "TÖRLÉS";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("hu-HU", { timeZone: "Europe/Budapest", dateStyle: "short", timeStyle: "short" }) : "—");

export default function PlayersPanel() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<AdminPlayer | null>(null);
  const [word, setWord] = useState("");
  const wordOk = word.trim().normalize("NFC").toLocaleUpperCase("hu-HU") === DELETE_WORD;
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

  // Review #449 (K2): a tanulói profil kapcsolatának bontása (közös eszközön tévesen kötött profil).
  const unlink = useMutation({
    mutationFn: (p: AdminPlayer) => apiRequest("POST", `/api/admin/game-accounts/${encodeURIComponent(p.id)}/unlink-learner`, {}),
    onSuccess: async (_r, p) => {
      toast({ title: "Tanulói kapcsolat bontva", description: p.nickname ?? "becenév nélküli fiók" });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/game-accounts"] });
    },
    onError: (e: Error) => toast({ title: "Nem sikerült", description: e.message, variant: "destructive" }),
  });

  // K1: a „törölt, de tiltva maradt” bejegyzések (cím nélkül) és feloldásuk. A kulcs a lista prefixe alatt van, így a
  // tiltás / törlés utáni frissítés ezt is újratölti.
  const deletedBans = useQuery<{ entries: DeletedBan[] }>({
    queryKey: ["/api/admin/game-accounts", { deletedBans: true }],
    queryFn: () => apiRequest("GET", "/api/admin/game-accounts/deleted-bans"),
  });
  const unbanDeleted = useMutation({
    mutationFn: (e: DeletedBan) => apiRequest("POST", `/api/admin/game-accounts/deleted-bans/${encodeURIComponent(e.ref)}/unban`, {}),
    onSuccess: async () => {
      toast({ title: "Tiltás feloldva", description: "A törölt fiók címével ismét nyitható rendes fiók." });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/game-accounts"] });
    },
    onError: (e: Error) => toast({ title: "Nem sikerült", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (p: AdminPlayer) => apiRequest("POST", `/api/admin/game-accounts/${encodeURIComponent(p.id)}/delete`, { confirm: DELETE_WORD }),
    onSuccess: async (_r, p) => {
      setToDelete(null);
      toast({ title: "Fiók véglegesen törölve", description: p.nickname ?? "becenév nélküli fiók" });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/game-accounts"] });
    },
    onError: (e: Error) => toast({ title: "Nem sikerült törölni", description: e.message, variant: "destructive" }),
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
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  {p.learnerLinked && (
                    <Button size="sm" variant="ghost" className="gap-1" disabled={unlink.isPending} onClick={() => unlink.mutate(p)} data-testid={`button-player-unlink-${p.id}`}>
                      <Unlink className="h-4 w-4" /> Tanuló bontása
                    </Button>
                  )}
                  {!revealed[p.id] && (
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => void reveal(p)} title="A teljes e-mail-cím megjelenítése (csak adminnak)">
                      <Eye className="h-4 w-4" /> Cím
                    </Button>
                  )}
                  <Button size="sm" variant={p.banned ? "secondary" : "destructive"} className="gap-1" disabled={toggleBan.isPending}
                    onClick={() => toggleBan.mutate(p)} data-testid={`button-player-ban-${p.id}`}>
                    {p.banned ? <><RotateCcw className="h-4 w-4" /> Feloldás</> : <><Ban className="h-4 w-4" /> Tiltás</>}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 border-destructive text-destructive" disabled={remove.isPending}
                    onClick={() => { setWord(""); setToDelete(p); }} data-testid={`button-player-delete-${p.id}`}>
                    <Trash2 className="h-4 w-4" /> Törlés
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {(deletedBans.data?.entries?.length ?? 0) > 0 && (
          <section className="space-y-2" data-testid="deleted-bans">
            <h3 className="text-sm font-semibold">Törölt, de tiltva maradt fiókok</h3>
            <p className="text-xs text-muted-foreground">
              A fiók törlődött, de a tiltás megmaradt: ugyanazzal az e-mail-címmel csak tiltott fiók nyitható. Cím nincs tárolva — csak
              egy visszafejthetetlen ujjlenyomat és a dátumok.
            </p>
            <ul className="divide-y rounded-md border">
              {(deletedBans.data?.entries ?? []).map((e) => (
                <li key={e.ref} className="flex flex-wrap items-center gap-3 p-3 text-sm" data-testid={`deleted-ban-${e.ref}`}>
                  <span className="font-mono text-xs text-muted-foreground">#{e.ref.slice(0, 8)}</span>
                  <span>tiltva: {fmt(e.bannedAt)} · törölve: {fmt(e.deletedAt)}</span>
                  <Button size="sm" variant="secondary" className="ml-auto gap-1" disabled={unbanDeleted.isPending}
                    onClick={() => unbanDeleted.mutate(e)} data-testid={`button-deleted-ban-unban-${e.ref}`}>
                    <RotateCcw className="h-4 w-4" /> Feloldás
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <AlertDialog open={toDelete !== null} onOpenChange={(open) => { if (!open) setToDelete(null); }}>
          <AlertDialogContent className="text-slate-900" data-testid="dialog-player-delete">
            <AlertDialogHeader>
              <AlertDialogTitle>Végleges törlés</AlertDialogTitle>
              <AlertDialogDescription>
                Törlődik a(z) „{toDelete?.nickname ?? "becenév nélküli"}” fiók: becenév, avatar, e-mail-cím, a belépőkódok, és minden
                eszközön kilép. A tanulói profil megmarad. Ez nem vonható vissza.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label htmlFor="player-delete-word" className="text-sm font-semibold">Írd be: <strong>{DELETE_WORD}</strong></label>
            <Input id="player-delete-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" data-testid="input-player-delete-confirm" />
            <AlertDialogFooter>
              <AlertDialogCancel>Mégse</AlertDialogCancel>
              <Button variant="destructive" disabled={!wordOk || remove.isPending} onClick={() => { if (toDelete) remove.mutate(toDelete); }} data-testid="button-player-delete-confirm">
                Végleges törlés
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
