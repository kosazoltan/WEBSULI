/**
 * JM7b — a játékos „kis fiókja” (`/fiok`, és a `/profile` utódja bejelentkezett játékosnál; terv 10.4 „Fiókoldal”, D11).
 * Becenév + avatar, az eszközön HELYBEN gyűjtött haladás (XP, szint, jelvények, játékonkénti rekordok), tanulói profil
 * összekapcsolása (megerősítéssel), „Adataim letöltése”, „Kijelentkezés”, „Fiók törlése” (beírt megerősítő szóval).
 * Vendégnél (vagy kikapcsolt `PLAYER_ACCOUNTS` flagnél) a `/profile` a régi, helyi Profil oldal marad.
 * A becenév MINDENHOL szövegként jelenik meg (React-szövegcsomópont), HTML-ként soha.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Award, Download, Flame, Link2, LogOut, Pencil, ShieldCheck, Sparkles, Star, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CosmicBackground from "@/components/CosmicBackground";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { AVATARS } from "@shared/player-avatars";
import { PLAYER_NICK_MAX, checkPlayerNickname, NICKNAME_MESSAGES } from "@shared/player-nickname";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements";
import { getLearnerToken } from "@/lib/learnerProfile";
import { levelFromXp, readLocalProgress, type LocalProgress } from "@/lib/localGameProgress";
import {
  PLAYER_ME_KEY, clearPlayerCache, deletePlayerAccount, requestDeleteCode, playerAccountKey, exportPlayerData, fetchNicknameSuggestions, linkLearnerProfile, logoutPlayer,
  savePlayerProfile, unlinkLearnerProfile, usePlayer, usePlayerAccount, type PlayerAccountView,
} from "@/hooks/usePlayer";

const LegacyProfile = lazy(() => import("@/pages/Profile"));
const DELETE_WORD = "TÖRLÖM";

const ERR: Record<string, string> = {
  NETWORK: "Nem sikerült elérni a szervert. Nézd meg, van-e internet, és próbáld újra!",
  RATE_LIMITED: "Ezt most túl sokszor próbáltad. Várj egy kicsit!",
  SERVER_ERROR: "Valami elromlott. Próbáld újra egy kicsit később!",
  BANNED: "Ezzel a fiókkal most nem lehet játszani.",
  UNAUTHORIZED: "Lejárt a belépésed. Lépj be újra!",
  BAD_AVATAR: "Ez az avatar nem választható.",
  LEARNER_TOKEN_INVALID: "Ezen az eszközön nincs érvényes tanulói profil (vagy a párosítást visszavonták).",
  LEARNER_ALREADY_LINKED: "Ez a tanulói profil már egy másik játékfiókhoz tartozik.",
  CONFIRM_REQUIRED: `A törléshez pontosan ezt írd be: ${DELETE_WORD}`,
  LOGOUT_FAILED: "Nem sikerült kijelentkezni — próbáld újra! Amíg nem sikerül, a fiók ezen az eszközön belépve marad.",
  REAUTH_REQUIRED: "A biztonság kedvéért az összekapcsolás előtt lépj be újra (kódot kapsz e-mailben), utána rögtön összekapcsolhatod.",
  CODE_INVALID: "Ez a kód nem jó, vagy már lejárt. Kérj új kódot!",
};

export default function PlayerAccount() {
  const [location, setLocation] = useLocation();
  const { enabled, player, banned, isLoading } = usePlayer();
  const isProfileRoute = location === "/profile";

  useEffect(() => {
    if (!isLoading && enabled && !player && !banned && !isProfileRoute) setLocation("/belepes");
  }, [isLoading, enabled, player, banned, isProfileRoute, setLocation]);

  if (isLoading) return <div className="min-h-screen" style={{ backgroundColor: "#0A0E27" }} data-testid="player-account-loading" />;
  // N2 (tulajdonosi döntés 2026-11-16): a tiltott fiók csak az adatai letöltését és a fiók törlését éri el.
  if (enabled && banned) return <BannedView />;
  if (!enabled || !player) {
    // Vendég / kikapcsolt flag: a /profile a régi, helyi oldal; a /fiok a belépésre visz (fent).
    return (
      <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: "#0A0E27" }} />}>
        <LegacyProfile />
      </Suspense>
    );
  }
  // Review #449: fiókváltáskor (megosztott eszköz) a nézet és a szerkesztő állapota újraindul — semmi nem öröklődik A-tól.
  return <AccountView key={player.id} playerId={player.id} />;
}

function AccountView({ playerId }: { playerId: string }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: fetched, isLoading } = usePlayerAccount(playerId);
  // Kettős védelem: más játékos adata (bármilyen okból) nem jelenhet meg.
  const account = fetched && fetched.id === playerId ? fetched : null;
  const [local] = useState<LocalProgress>(() => readLocalProgress());
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: playerAccountKey(playerId) });
    await queryClient.invalidateQueries({ queryKey: PLAYER_ME_KEY });
  };

  if (isLoading) return <div className="min-h-screen" style={{ backgroundColor: "#0A0E27" }} data-testid="player-account-loading" />;
  if (!account) {
    return (
      <Shell>
        <div className="glass-card rounded-2xl border border-white/15 p-6 text-center text-white" role="alert">
          <p>{ERR.UNAUTHORIZED}</p>
          <Button className="mt-4" onClick={() => setLocation("/belepes")}>Belépés</Button>
        </div>
      </Shell>
    );
  }

  const showEditor = editing || account.needsProfile;
  return (
    <Shell>
      <Hero account={account} local={local} onEdit={() => setEditing(true)} editing={showEditor} />
      {notice && <p className="mb-3 rounded-xl border border-emerald-300/40 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-100" role="status" data-testid="player-account-notice">{notice}</p>}
      {showEditor && (
        <ProfileEditor
          account={account}
          onSaved={async (msg) => { setEditing(false); setNotice(msg); await refresh(); }}
          onCancel={account.needsProfile ? undefined : () => setEditing(false)}
        />
      )}
      <StatsCard local={local} />
      <RecordsCard local={local} />
      <BadgesCard local={local} />
      <LearnerCard account={account} onChanged={async (msg) => { setNotice(msg); await refresh(); }} />
      <AccountActions maskedEmail={account.maskedEmail} googleLinked={account.googleLinked} local={local} />
    </Shell>
  );
}

/** N2: tiltott fiók — magyarázat + „Adataim letöltése”, „Kijelentkezés”, „Fiók törlése” (ugyanazokkal a védelmekkel). */
function BannedView() {
  const [local] = useState<LocalProgress>(() => readLocalProgress());
  return (
    <Shell>
      <div className="mb-4 rounded-3xl border border-amber-300/40 bg-amber-900/30 p-4 text-amber-50" role="status" data-testid="player-banned-notice">
        <p className="font-extrabold">Ez a fiók le van tiltva.</p>
        <p className="mt-1 text-sm">Játszani és a becenevet módosítani most nem lehet. Az adataidat letöltheted, és ha szeretnéd, a fiókot véglegesen törölheted.</p>
      </div>
      <AccountActions maskedEmail={null} googleLinked={false} local={local} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#0A0E27" }} data-testid="page-player-account">
      <CosmicBackground />
      <main className="relative z-10 mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-6">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/games">
            <Button variant="outline" size="sm" className="gap-1 border-white/40 text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" /> Játékok
            </Button>
          </Link>
          <h1 className="text-xl font-extrabold tracking-tight text-white">Fiókom</h1>
        </div>
        {children}
      </main>
    </div>
  );
}

function Hero({ account, local, onEdit, editing }: { account: PlayerAccountView; local: LocalProgress; onEdit: () => void; editing: boolean }) {
  const lvl = levelFromXp(local.stats.totalXp);
  return (
    <section className="relative mb-4 overflow-hidden rounded-3xl border border-fuchsia-300/40 bg-gradient-to-br from-indigo-600/50 via-fuchsia-600/35 to-amber-500/30 p-4 text-white shadow-[0_0_30px_rgba(217,70,239,0.25)]" data-testid="player-account-hero">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0 rounded-full bg-white/15 p-2 ring-4 ring-white/25">
          <PlayerAvatar avatarKey={account.avatar} seed={account.id} size={84} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-black text-slate-900 shadow" data-testid="player-level">{lvl.level}. szint</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Becenév</p>
          <p className="truncate text-2xl font-black leading-tight" data-testid="player-nickname">{account.nickname ?? "Új játékos"}</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/30" aria-label={`Szint-haladás: ${Math.round(lvl.progress * 100)}%`}>
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-lime-300 transition-all" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-white/80 tabular-nums">{local.stats.totalXp.toLocaleString("hu-HU")} XP ezen az eszközön · a következő szintig {(lvl.next - local.stats.totalXp).toLocaleString("hu-HU")} XP</p>
        </div>
      </div>
      {!editing && (
        <Button size="sm" variant="outline" className="mt-3 w-full gap-1 font-bold" onClick={onEdit} data-testid="button-edit-profile">
          <Pencil className="h-4 w-4" /> Becenév és avatar
        </Button>
      )}
    </section>
  );
}

function ProfileEditor({ account, onSaved, onCancel }: { account: PlayerAccountView; onSaved: (msg: string) => void | Promise<void>; onCancel?: () => void }) {
  const [nickname, setNickname] = useState(account.nickname ?? "");
  const [avatar, setAvatar] = useState<string>(account.avatar ?? AVATARS[0]!.key);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void fetchNicknameSuggestions().then(setSuggestions); }, []);

  const localCheck = useMemo(() => (nickname.trim() === "" ? null : checkPlayerNickname(nickname)), [nickname]);
  const localProblems = localCheck && !localCheck.ok ? localCheck.problems.map((p) => NICKNAME_MESSAGES[p]) : [];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localCheck?.ok) { setErrors(localProblems.length ? localProblems : [NICKNAME_MESSAGES.LENGTH_SHORT]); return; }
    setBusy(true); setErrors([]);
    const nickChanged = localCheck.nickname !== account.nickname;
    const r = await savePlayerProfile({ ...(nickChanged ? { nickname: localCheck.nickname } : {}), avatar });
    setBusy(false);
    if (r.ok) { await onSaved(account.needsProfile ? "Kész! Mostantól ezzel a névvel látnak a többiek." : "Elmentettük."); return; }
    if (r.code === "BAD_NICKNAME") setErrors(r.messages);
    else if (r.code === "NICKNAME_TAKEN") {
      setErrors([r.suggestion ? `Ez a becenév már foglalt. Mit szólsz ehhez: ${r.suggestion}?` : "Ez a becenév már foglalt. Válassz másikat!"]);
      if (r.suggestion) setSuggestions((s) => [r.suggestion!, ...s.filter((x) => x !== r.suggestion)].slice(0, 5));
    } else setErrors([ERR[r.code] ?? ERR.SERVER_ERROR]);
  };

  return (
    <form onSubmit={save} className="mb-4 rounded-3xl border border-cyan-300/40 bg-slate-900/70 p-4 text-white" data-testid="player-profile-editor">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold"><Sparkles className="h-5 w-5 text-amber-300" /> {account.needsProfile ? "Válassz becenevet és avatart!" : "Becenév és avatar"}</h2>
      <p className="mb-3 text-xs text-white/70">A többi játékos csak ezt a kettőt látja. A valódi neved és az e-mail-címed soha nem látszik.</p>
      <label htmlFor="player-nickname" className="text-sm font-bold">Becenév</label>
      <Input id="player-nickname" value={nickname} maxLength={PLAYER_NICK_MAX + 5} autoComplete="off" autoCapitalize="words"
        onChange={(e) => setNickname(e.target.value)} className="mt-1 h-12 bg-white text-lg text-slate-900" data-testid="input-player-nickname" />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Ajánlott becenevek">
          {suggestions.map((s) => (
            <button type="button" key={s} onClick={() => setNickname(s)} className="rounded-full border border-amber-300/60 bg-amber-400/15 px-3 py-1.5 text-sm font-semibold text-amber-100 hover:bg-amber-400/30" data-testid="nickname-suggestion">{s}</button>
          ))}
        </div>
      )}
      {(errors.length > 0 || localProblems.length > 0) && (
        <ul className="mt-2 space-y-0.5 text-sm text-rose-200" role="alert" data-testid="player-nickname-errors">
          {(errors.length > 0 ? errors : localProblems).map((m) => <li key={m}>• {m}</li>)}
        </ul>
      )}
      <p className="mt-4 text-sm font-bold">Avatar</p>
      <div className="mt-2 grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Avatar">
        {AVATARS.map((a) => (
          <button type="button" key={a.key} role="radio" aria-checked={avatar === a.key} aria-label={a.label} onClick={() => setAvatar(a.key)}
            className={`flex aspect-square items-center justify-center rounded-xl border-2 transition ${avatar === a.key ? "scale-105 border-amber-300 bg-amber-300/25" : "border-white/10 bg-white/5 hover:bg-white/15"}`}
            data-testid={`avatar-${a.key}`}>
            <PlayerAvatar avatarKey={a.key} size={40} />
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="jelly" className="h-12 flex-1 text-base" disabled={busy} data-testid="button-save-profile">
          {busy ? "Mentés…" : "Mentés"}
        </Button>
        {onCancel && <Button type="button" variant="ghost" className="h-12 text-white hover:bg-white/10" onClick={onCancel}>Mégse</Button>}
      </div>
    </form>
  );
}

function StatsCard({ local }: { local: LocalProgress }) {
  const s = local.stats;
  const items: { label: string; value: number; icon: React.ReactNode }[] = [
    { label: "Összes XP", value: s.totalXp, icon: <Star className="h-3.5 w-3.5 text-amber-300" /> },
    { label: "Játszott kör", value: s.totalGames, icon: <Trophy className="h-3.5 w-3.5 text-cyan-300" /> },
    { label: "Helyes válasz", value: s.totalCorrectAnswers, icon: <ShieldCheck className="h-3.5 w-3.5 text-lime-300" /> },
    { label: "Legjobb sorozat", value: s.bestStreak, icon: <Flame className="h-3.5 w-3.5 text-orange-400" /> },
  ];
  return (
    <section className="mb-4" data-testid="player-stats">
      <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-white/60" data-testid="player-local-label">Ezen az eszközön gyűjtött haladás</p>
      <div className="grid grid-cols-2 gap-2">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">{i.icon}<span>{i.label}</span></div>
          <p className="mt-0.5 text-xl font-black tabular-nums">{i.value.toLocaleString("hu-HU")}</p>
        </div>
      ))}
      </div>
    </section>
  );
}

function RecordsCard({ local }: { local: LocalProgress }) {
  return (
    <section className="mb-4 rounded-3xl border border-white/10 bg-slate-900/60 p-4 text-white" data-testid="player-records">
      <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold"><Trophy className="h-5 w-5 text-amber-300" /> Rekordok ezen az eszközön</h2>
      <ul className="divide-y divide-white/10">
        {local.records.map((r) => (
          <li key={r.gameId} className="flex items-center gap-3 py-2">
            <span className="text-2xl" aria-hidden="true">{r.emoji}</span>
            <div className="min-w-0 flex-1">
              <Link href={r.href} className="font-bold hover:underline">{r.title}</Link>
              <p className="text-xs text-white/70">{r.lines.map((l) => `${l.label}: ${l.value.toLocaleString("hu-HU")}`).join(" · ")}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-white/55">Ezeken a számokon minden ezen az eszközön játszott kör osztozik — nem a fiókodhoz kötöttek, ha más is játszik itt, az ő köreit is mutatják. Hamarosan a fiókodba is elmentjük a pontokat.</p>
    </section>
  );
}

function BadgesCard({ local }: { local: LocalProgress }) {
  const got = local.unlockedIds.map((id) => ACHIEVEMENT_BY_ID[id]).filter(Boolean);
  return (
    <section className="mb-4 rounded-3xl border border-amber-300/30 bg-amber-900/15 p-4 text-white" data-testid="player-badges">
      <h2 className="mb-1 flex items-center gap-2 text-base font-extrabold"><Award className="h-5 w-5 text-amber-300" /> Jelvények ezen az eszközön</h2>
      <p className="text-xs text-white/75"><strong className="text-amber-300">{got.length}</strong> / {local.totalBadges} jelvény</p>
      {got.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {got.slice(0, 18).map((a) => (
            <span key={a!.id} title={a!.title} className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/40 bg-black/25 text-xl">{a!.icon}</span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-white/70">Még nincs jelvényed — játssz egy kört, és megszerzed az elsőt!</p>
      )}
    </section>
  );
}

function LearnerCard({ account, onChanged }: { account: PlayerAccountView; onChanged: (msg: string) => void | Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = getLearnerToken();
  if (!account.learnerLinked && !token) return null;

  const link = async () => {
    const t = getLearnerToken();
    setConfirming(false);
    if (!t) { setError(ERR.LEARNER_TOKEN_INVALID); return; }
    setBusy(true); setError(null);
    const r = await linkLearnerProfile(t);
    setBusy(false);
    if (r.ok) await onChanged("Összekapcsoltuk a tanulói profiloddal.");
    else setError(ERR[r.code] ?? ERR.SERVER_ERROR);
  };
  const unlink = async () => {
    setBusy(true); setError(null);
    const ok = await unlinkLearnerProfile();
    setBusy(false);
    if (ok) await onChanged("A tanulói profil kapcsolatát bontottuk.");
    else setError(ERR.SERVER_ERROR);
  };

  return (
    <section className="mb-4 rounded-3xl border border-sky-300/30 bg-sky-900/20 p-4 text-white" data-testid="player-learner">
      <h2 className="mb-1 flex items-center gap-2 text-base font-extrabold"><Link2 className="h-5 w-5 text-sky-300" /> Tanulói profil</h2>
      {account.learnerLinked ? (
        <>
          <p className="text-sm text-white/80">✓ Összekapcsolva a tanulói profiloddal.</p>
          <Button size="sm" variant="ghost" className="mt-2 text-white hover:bg-white/10" disabled={busy} onClick={() => void unlink()} data-testid="button-unlink-learner">Kapcsolat bontása</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-white/80">Ezen az eszközön van egy tanulói profilod. Összekapcsolod a játékfiókoddal?</p>
          <Button size="sm" variant="jelly" className="mt-2" disabled={busy} onClick={() => setConfirming(true)} data-testid="button-link-learner">Összekapcsolom</Button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-rose-200" role="alert" data-testid="player-learner-error">{error}</p>}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Összekapcsolod?</AlertDialogTitle>
            <AlertDialogDescription data-testid="player-learner-confirm-text">
              Ezt a tanulói profilt a(z) <strong>{account.nickname ?? "becenév nélküli"}</strong> játékfiókhoz kötöd. Csak akkor tedd, ha ez a TE fiókod ÉS a TE tanulói profilod
              (a te emlékeztető-linkedről párosítottad ezt az eszközt) — közös eszközön a testvéred profilját ne kösd a saját fiókodhoz. Bármikor bonthatod.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <Button onClick={() => void link()} data-testid="button-link-learner-confirm">Igen, az enyém</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AccountActions({ maskedEmail, googleLinked, local }: { maskedEmail: string | null; googleLinked: boolean; local: LocalProgress }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Kis- / nagybetűtől függetlenül elfogadjuk a beírást („törlöm” is jó), a szerver a nagybetűs alakot kapja.
  const confirmWord = word.trim().normalize("NFC").toLocaleUpperCase("hu-HU");

  /**
   * Review #449: csak SIKERES kijelentkezés után ürül a gyorsítótár és navigálunk tovább; sikertelenségnél jól látható,
   * újrapróbálható hiba, és a felület továbbra is belépettként mutat (a szerveroldali munkamenet él).
   */
  const leave = async (): Promise<boolean> => {
    setBusy(true); setError(null);
    const ok = await logoutPlayer();
    setBusy(false);
    if (!ok) { setError(ERR.LOGOUT_FAILED); return false; }
    await clearPlayerCache(queryClient);
    return true;
  };

  const download = async () => {
    setBusy(true); setError(null);
    const data = await exportPlayerData();
    setBusy(false);
    if (!data) { setError(ERR.SERVER_ERROR); return; }
    // A szerver adatai + az ezen az eszközön tárolt helyi haladás (ez is a játékos saját adata).
    const file = { ...data, localProgressOnThisDevice: { note: "Ezen az eszközön (böngészőben) gyűjtött haladás — nem a fiókhoz kötött; megosztott eszközön más játékosé is lehet.", stats: local.stats, badges: local.unlockedIds, records: local.records.map(({ gameId, lines }) => ({ gameId, lines })) } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "websuli-fiokom.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const remove = async () => {
    setBusy(true); setError(null);
    const r = await deletePlayerAccount(confirmWord, deleteCode.replace(/\D/g, ""));
    setBusy(false);
    if (r.ok) {
      setDeleteOpen(false);
      await clearPlayerCache(queryClient);
      setLocation("/games");
      return;
    }
    setError(ERR[r.code] ?? ERR.SERVER_ERROR);
  };

  const sendCode = async () => {
    setBusy(true); setError(null);
    const r = await requestDeleteCode();
    setBusy(false);
    if (r.ok) setCodeSent(true);
    else setError(ERR[r.code] ?? ERR.SERVER_ERROR);
  };

  return (
    <section className="mb-4 rounded-3xl border border-white/10 bg-slate-900/60 p-4 text-white" data-testid="player-account-actions">
      <h2 className="mb-1 text-base font-extrabold">Fiókadatok</h2>
      {maskedEmail !== null && <p className="text-sm text-white/75">E-mail: <span className="font-semibold" data-testid="player-masked-email">{maskedEmail}</span>{googleLinked ? " · Google-lal is beléphetsz" : ""}</p>}
      <div className="mt-3 grid gap-2">
        <Button variant="outline" className="justify-start gap-2" disabled={busy} onClick={() => void download()} data-testid="button-export-data"><Download className="h-4 w-4" /> Adataim letöltése</Button>
        <Button variant="outline" className="justify-start gap-2" disabled={busy} onClick={() => void leave().then((ok) => { if (ok) setLocation("/games"); })} data-testid="button-account-logout"><LogOut className="h-4 w-4" /> Kijelentkezés</Button>
        <Button variant="destructive" className="justify-start gap-2" onClick={() => { setWord(""); setDeleteCode(""); setCodeSent(false); setError(null); setDeleteOpen(true); }} data-testid="button-delete-account"><Trash2 className="h-4 w-4" /> Fiók törlése</Button>
      </div>
      {error && !deleteOpen && <p className="mt-2 text-sm text-rose-200" role="alert" data-testid="player-account-error">{error}</p>}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Biztosan törlöd a fiókodat?</AlertDialogTitle>
            <AlertDialogDescription>
              Törlődik a becenév, az avatar, az e-mail-címed és a fiókhoz kötött minden adat, és minden eszközön kilépsz. Ez nem vonható vissza.
              Az ezen az eszközön tárolt helyi pontjaid megmaradnak. Letiltott fióknál az e-mail-címed visszafejthetetlen ujjlenyomata
              megmarad, hogy ugyanazzal a címmel se lehessen tiltás nélkül új fiókot nyitni (a teljes cím nem).
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!codeSent ? (
            <p className="text-sm">A biztonság kedvéért egy megerősítő kódot küldünk a fiókod e-mail-címére{maskedEmail ? ` (${maskedEmail})` : ""}. Csak az tudja törölni a fiókot, aki hozzáfér a postafiókhoz.</p>
          ) : (
            <>
              <p className="text-sm" data-testid="player-delete-code-sent">Elküldtük a kódot {maskedEmail ? `a(z) ${maskedEmail} címre` : "a fiókod e-mail-címére"} (a Spam mappát is nézd meg).</p>
              <label htmlFor="delete-code" className="text-sm font-semibold">A levélben kapott 8 jegyű kód</label>
              <Input id="delete-code" inputMode="numeric" autoComplete="one-time-code" maxLength={9} value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 8))} data-testid="input-delete-code" />
              <label htmlFor="delete-confirm" className="text-sm font-semibold">Írd be: <strong>{DELETE_WORD}</strong></label>
              <Input id="delete-confirm" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" data-testid="input-delete-confirm" />
            </>
          )}
          {error && <p className="text-sm text-destructive" role="alert" data-testid="player-delete-error">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            {!codeSent ? (
              <Button variant="destructive" disabled={busy} onClick={() => void sendCode()} data-testid="button-delete-send-code">Kódot kérek e-mailben</Button>
            ) : (
              <Button variant="destructive" disabled={busy || confirmWord !== DELETE_WORD || deleteCode.length !== 8} onClick={() => void remove()} data-testid="button-delete-confirm">Végleges törlés</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
