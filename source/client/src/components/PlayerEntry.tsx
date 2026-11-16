/**
 * J8-belépő — a Játékok oldal „Belépés” / „Fiókom” belépője (terv J8, végrehajtás „J8-belépő”).
 * CSAK bekapcsolt `PLAYER_ACCOUNTS` flag mellett jelenik meg: kikapcsolt / töltő / hibás státusznál a komponens SEMMIT nem
 * renderel (nincs helyfoglalás, a mai kinézet változatlan), és a játékos-hookokon kívül más kérést nem indít.
 * A becenév és az avatar a szerverről jön (`/api/player/me`, `/api/player/account`), a kliens nem talál ki nevet.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useAuth } from "@/hooks/useAuth";
import { usePlayer, usePlayerAccount, usePlayerStatus } from "@/hooks/usePlayer";
import { cn } from "@/lib/utils";

/** Az első látogatás magyarázata: az első megjelenítés után elrejtjük (a böngészőben tárolt, személyes adat nélküli jelző). */
export const PLAYER_ENTRY_SEEN_KEY = "websuli.playerEntry.seen";

function readSeen(): boolean {
  try { return localStorage.getItem(PLAYER_ENTRY_SEEN_KEY) === "1"; } catch { return false; }
}
function writeSeen(): void {
  try { localStorage.setItem(PLAYER_ENTRY_SEEN_KEY, "1"); } catch { /* privát mód: a magyarázat marad */ }
}

export default function PlayerEntry() {
  const { enabled } = usePlayerStatus();
  // A flag KI: semmi nem renderelődik, és az admin-munkamenet (useAuth) sem kérődik le emiatt.
  if (!enabled) return null;
  return <EnabledEntry />;
}

function EnabledEntry() {
  const { player, banned, isLoading } = usePlayer();
  const { user } = useAuth();
  const { data: account } = usePlayerAccount(player?.id ?? null);

  if (isLoading) return <div className="mb-4 min-h-12" aria-hidden="true" data-testid="player-entry-loading" />;
  if (player || banned) {
    const nickname = player?.nickname ?? null;
    const label = banned ? "Fiókom" : nickname ? `Fiókom: ${nickname}` : "Fiókom: válassz becenevet";
    return (
      <div className="mb-4" data-testid="player-entry">
        <Link
          href="/fiok"
          aria-label={label}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-3 py-1.5 text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-amber-200 sm:max-w-sm"
          data-testid="link-player-account"
        >
          {player && <PlayerAvatar avatarKey={account?.avatar ?? null} seed={player.id} size={36} className="shrink-0" title="" />}
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="text-xs font-semibold text-white/75">Fiókom</span>
            <span className="truncate text-base font-extrabold" data-testid="player-entry-nickname">
              {banned ? "Adataim és beállításaim" : nickname ?? "Válassz becenevet!"}
            </span>
          </span>
        </Link>
      </div>
    );
  }
  return <SignedOutEntry accountSession={!!user} />;
}

function SignedOutEntry({ accountSession }: { accountSession: boolean }) {
  const [seen] = useState(readSeen);
  useEffect(() => { writeSeen(); }, []);
  // Felnőtt / admin munkamenet mellett a játékos-belépés előbb kilépést kér (a belépési oldal ezt részletezi) — ezt nem titkoljuk el.
  const text = accountSession
    ? "Most felnőtt vagy admin fiókkal vagy belépve. Játékosként előbb abból lépj ki."
    : seen ? null : "Lépj be, és válassz becenevet meg avatart — jelszó nem kell.";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-white/20 bg-white/5 p-3" data-testid="player-entry">
      {text && <p className="min-w-0 flex-1 basis-40 text-sm leading-snug text-slate-100" data-testid="player-entry-hint">{text}</p>}
      <Link
        href="/belepes"
        className={cn(buttonVariants({ variant: "jelly" }), "h-12 min-w-[48px] shrink-0 px-6 text-base", !text && "ml-auto")}
        data-testid="link-player-login"
      >
        Belépés
      </Link>
    </div>
  );
}
