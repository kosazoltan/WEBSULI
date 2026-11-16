/**
 * JM7a — játékos belépés / regisztráció (`/belepes`, `/belepes/link`; terv 10.4, D11). E-mail-cím + 8 jegyű kód VAGY a
 * levélben kapott link; jelszó, név, életkor nincs. A link tokenje a URL-töredékben (`#t=`) érkezik: azonnal törlődik a
 * címsorból. Biztonsági review #445 (K3): a link megnyitása SOHA nem léptet be magától — megerősítő képernyőt mutat
 * („Belépés mint a***@p***.hu?”), és csak a gombnyomás váltja be POST-tal; élő fiók-munkamenet (admin / felnőtt fiók)
 * mellett nincs beváltás, és ha már egy MÁSIK játékfiókkal van belépve, külön figyelmeztet. A `PLAYER_ACCOUNTS` flag KI
 * állapotában az oldal nem létezik (a „nem található” oldal jelenik meg).
 * JM7b: „Belépés Google-fiókkal” (a játékos külön Google-útja, server/player/google.ts); a visszatérési hibakód (`?hiba=`)
 * magyar üzenetként jelenik meg; belépés után a „Fiókom” (/fiok) gomb, becenév nélkül oda vezet elsőként.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import NotFound from "@/pages/not-found";
import {
  clearPlayerCache, checkPlayerLink, logoutPlayer, startPlayerLogin, usePlayer, verifyPlayerLogin, type LinkInfo, type VerifyResult,
} from "@/hooks/usePlayer";

type Step = "email" | "code" | "link-checking" | "link-confirm" | "link" | "done" | "link-error";
type LinkDetails = Extract<LinkInfo, { ok: true }>;

const CODE_LENGTH = 8;

const ERRORS: Record<Exclude<VerifyResult, { ok: true }>["code"] | "INVALID_EMAIL", string> = {
  INVALID_OR_EXPIRED: "Ez a kód nem jó, vagy már lejárt. Nézd meg újra a leveled, vagy kérj új kódot!",
  BANNED: "Ezzel a fiókkal most nem lehet játszani. Az adataidat e-mail-kódos belépéssel letöltheted, vagy törölheted a fiókot.",
  RATE_LIMITED: "Túl sok próbálkozás. Várj egy kicsit, és próbáld újra!",
  UNAVAILABLE: "A belépés most nem elérhető.",
  SERVER_ERROR: "Valami elromlott. Próbáld újra egy kicsit később!",
  NETWORK: "Nem sikerült elérni a szervert. Nézd meg, van-e internet, és próbáld újra!",
  ACCOUNT_SESSION: "Ebben a böngészőben most egy másik (felnőtt vagy admin) fiók van belépve. Előbb abból lépj ki, utána tudsz játékosként belépni.",
  INVALID_EMAIL: "Ez nem tűnik e-mail-címnek. Nézd meg, jól írtad-e!",
};

const LINK_INVALID = "Ez a link már nem jó: lejárt, vagy valaki már használta. Kérj új kódot!";

/** JM7b: a játékos Google-út visszatérési hibakódjai (`/belepes?hiba=…`, server/player/google.ts) — személyes adat nélkül. */
const GOOGLE_ERRORS: Record<string, string> = {
  "fiok-munkamenet": ERRORS.ACCOUNT_SESSION,
  google: "A Google-belépés nem sikerült. Próbáld újra, vagy lépj be e-mail-kóddal!",
  "nincs-megerositve": "Ennek a Google-fióknak az e-mail-címe nincs megerősítve. Lépj be e-mail-kóddal!",
  tiltva: ERRORS.BANNED,
  utkozes: "Ehhez az e-mail-címhez már egy másik Google-fiók tartozik. Lépj be e-mail-kóddal!",
  "nem-elerheto": ERRORS.UNAVAILABLE,
};

/** A `?hiba=` kiolvasása és azonnali törlése a címsorból. */
function takeGoogleError(): string | null {
  const code = new URLSearchParams(window.location.search).get("hiba");
  if (code === null) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  return GOOGLE_ERRORS[code] ?? GOOGLE_ERRORS.google!;
}

/** A `#t=<token>` töredék kiolvasása és AZONNALI törlése a címsorból (ne maradjon az előzményekben). */
function takeLinkToken(): string | null {
  const match = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  return match ? match[1]! : null;
}

export default function PlayerLogin() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { enabled, player, isLoading } = usePlayer();
  const isLinkRoute = location === "/belepes/link";
  const [step, setStep] = useState<Step>(isLinkRoute ? "link-checking" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => (isLinkRoute ? null : takeGoogleError()));
  const [linkInfo, setLinkInfo] = useState<LinkDetails | null>(null);
  const linkHandled = useRef(false);
  /** A link tokenje a címsorból törlődik, de a megerősítéshez / újrapróbához memóriában marad. */
  const linkToken = useRef<string | null>(null);
  const [linkRetry, setLinkRetry] = useState<null | "check" | "redeem">(null);
  // Review #445: lecsatolás után ne írjunk állapotot (a válasz / időtúllépés később érkezhet).
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const finish = async () => {
    await clearPlayerCache(queryClient);
    if (mounted.current) setStep("done");
  };

  /** N2: a tiltott fiók korlátozott munkamenetet kap — a fiókoldal csak a letöltést és a törlést kínálja. */
  const toBannedAccount = async () => {
    await clearPlayerCache(queryClient);
    if (mounted.current) setLocation("/fiok");
  };

  const linkFailed = (codeName: string, retry: "check" | "redeem") => {
    const retryable = codeName === "NETWORK" || codeName === "SERVER_ERROR";
    setLinkRetry(retryable ? retry : null);
    setError(codeName === "INVALID_OR_EXPIRED" ? LINK_INVALID : ERRORS[codeName as keyof typeof ERRORS] ?? ERRORS.SERVER_ERROR);
    setStep("link-error");
  };

  /** 1. lépés: a link ellenőrzése beváltás NÉLKÜL → megerősítő képernyő. */
  const checkLink = async () => {
    const token = linkToken.current;
    if (!token) { setError(LINK_INVALID); setStep("link-error"); return; }
    setStep("link-checking"); setError(null); setLinkRetry(null);
    const r = await checkPlayerLink(token);
    if (!mounted.current) return;
    if (r.ok) { setLinkInfo(r); setStep("link-confirm"); return; }
    linkFailed(r.code, "check");
  };

  /** 2. lépés: a felhasználó gombnyomására a beváltás. */
  const redeemLink = async () => {
    const token = linkToken.current;
    if (!token) { setError(LINK_INVALID); setStep("link-error"); return; }
    setStep("link"); setError(null); setLinkRetry(null);
    const r = await verifyPlayerLogin({ kind: "link", linkToken: token });
    if (!mounted.current) return;
    if (r.ok) { linkToken.current = null; await finish(); return; }
    if (r.code === "BANNED") { linkToken.current = null; await toBannedAccount(); return; }
    linkFailed(r.code, "redeem");
  };

  useEffect(() => {
    if (!isLinkRoute || !enabled || linkHandled.current) return;
    linkHandled.current = true;
    linkToken.current = takeLinkToken();
    void checkLink();
  }, [isLinkRoute, enabled]);

  if (isLoading) return <div className="min-h-screen bg-background" data-testid="player-login-loading" />;
  if (!enabled) return <NotFound />;

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await startPlayerLogin(email);
      if (!mounted.current) return;
      if (r === "SENT") { setCode(""); setStep("code"); }
      else setError(ERRORS[r]);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await verifyPlayerLogin({ kind: "code", email, code });
      if (!mounted.current) return;
      if (r.ok) await finish();
      else if (r.code === "BANNED") await toBannedAccount();
      else setError(ERRORS[r.code]);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const logout = async () => {
    const ok = await logoutPlayer();
    if (ok) await clearPlayerCache(queryClient);
    if (!mounted.current) return;
    if (ok) { setError(null); setStep("email"); }
    else setError(ERRORS.NETWORK);
  };

  const toNewCode = () => { linkToken.current = null; setLinkInfo(null); setError(null); setStep("email"); setLocation("/belepes"); };
  const signedIn = step === "done" || (!!player && step === "email");

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background" data-testid="page-player-login">
      <Card className="w-full max-w-sm border-orange-500/20 shadow-xl">
        <CardHeader className="text-center space-y-2 [@media(max-height:480px)]:pb-2 [@media(max-height:480px)]:pt-4">
          <div className="text-4xl [@media(max-height:480px)]:hidden" aria-hidden="true">🎮</div>
          <CardTitle className="text-2xl">{signedIn ? "Bent vagy!" : "Belépés a játékokhoz"}</CardTitle>
          {!signedIn && step === "email" && (
            <CardDescription>Írd be az e-mail-címed, és küldünk egy {CODE_LENGTH} jegyű kódot. Jelszó nem kell.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {signedIn ? (
            <div className="space-y-3 text-center" data-testid="player-login-done">
              <p>Sikerült a belépés. Jó játékot! 🎉</p>
              {player?.needsProfile ? (
                <Button className="w-full" onClick={() => setLocation("/fiok")} data-testid="button-player-to-account">Válassz becenevet és avatart!</Button>
              ) : (
                <Button className="w-full" onClick={() => setLocation("/games")} data-testid="button-player-to-games">Irány a játékok!</Button>
              )}
              <Button variant="outline" className="w-full" onClick={() => setLocation("/fiok")} data-testid="button-player-account">Fiókom</Button>
              <Button variant="ghost" className="w-full" onClick={() => void logout()} data-testid="button-player-logout">Kilépés</Button>
            </div>
          ) : step === "email" ? (
            <form onSubmit={requestCode} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="player-email">E-mail-cím</Label>
                <Input id="player-email" type="email" inputMode="email" autoComplete="email" required maxLength={254} className="h-12 text-lg"
                  value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-player-email" />
              </div>
              <Button type="submit" className="w-full" disabled={busy || email.trim() === ""} data-testid="button-player-request-code">
                {busy ? "Küldés…" : "Kérem a kódot"}
              </Button>
              <p className="text-xs text-muted-foreground">Nem kérjük a neved és az életkorod. Az e-mail-címedet senki más nem látja.</p>
              {/* JM7b: a játékos KÜLÖN Google-útja (csak játékos-fiók, admin-jog soha) — teljes oldalas navigáció a Google-hoz. */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden="true"><span className="h-px flex-1 bg-border" />vagy<span className="h-px flex-1 bg-border" /></div>
              <Button asChild variant="outline" className="w-full">
                <a href="/auth/player/google?returnTo=/fiok" data-testid="button-player-google">Belépés Google-fiókkal</a>
              </Button>
            </form>
          ) : step === "code" ? (
            <form onSubmit={submitCode} className="space-y-3">
              <p className="text-sm">Elküldtük a kódot az e-mail-címedre. A levélben lévő gombbal is beléphetsz. Ha nem látod a levelet, nézd meg a Spam mappát is!</p>
              <div className="space-y-1.5">
                <Label htmlFor="player-code">{CODE_LENGTH} jegyű kód</Label>
                <Input id="player-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={9} required
                  className="h-14 text-center text-2xl tracking-[0.3em]" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))} data-testid="input-player-code" />
              </div>
              <Button type="submit" className="w-full" disabled={busy || code.length !== CODE_LENGTH} data-testid="button-player-verify">
                {busy ? "Ellenőrzés…" : "Belépés"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("email"); setError(null); }} data-testid="button-player-new-code">
                Új kódot kérek / másik cím
              </Button>
            </form>
          ) : step === "link-checking" || step === "link" ? (
            <p className="text-center" data-testid="player-login-linking">{step === "link" ? "Belépés folyamatban…" : "A link ellenőrzése…"}</p>
          ) : step === "link-confirm" && linkInfo ? (
            <div className="space-y-3 text-center" data-testid="player-login-link-confirm">
              {linkInfo.accountSession ? (
                <>
                  <p role="alert" data-testid="player-login-account-session">{ERRORS.ACCOUNT_SESSION}</p>
                  <Button className="w-full" onClick={() => setLocation("/")}>Vissza a főoldalra</Button>
                </>
              ) : linkInfo.current === "same" ? (
                <>
                  <p>Már ezzel a fiókkal vagy belépve.</p>
                  <Button className="w-full" onClick={() => setLocation("/games")}>Irány a játékok!</Button>
                </>
              ) : (
                <>
                  <p>Belépés ezzel a fiókkal: <strong data-testid="player-login-link-account">{linkInfo.maskedEmail}</strong></p>
                  {linkInfo.current === "other" && (
                    <p className="text-sm text-destructive" data-testid="player-login-link-switch">Most egy másik játékfiókkal vagy belépve. Ha folytatod, abból kilépsz.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Csak akkor lépj be, ha te kérted ezt a linket, és ez a te címed.</p>
                  <Button className="w-full" onClick={() => void redeemLink()} data-testid="button-player-link-confirm">Belépek</Button>
                  <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>Mégse</Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-center" data-testid="player-login-link-error">
              <p role="alert">{error ?? LINK_INVALID}</p>
              {linkRetry && (
                <Button className="w-full" onClick={() => void (linkRetry === "check" ? checkLink() : redeemLink())} data-testid="button-player-link-retry">Újrapróbálom</Button>
              )}
              <Button className="w-full" variant={linkRetry ? "ghost" : "default"} onClick={toNewCode}>Új kódot kérek</Button>
            </div>
          )}
          {error && step !== "link-error" && (
            <p role="alert" className="text-sm text-destructive" data-testid="player-login-error">{error}</p>
          )}
          {!signedIn && (
            <Button asChild variant="ghost" className="w-full">
              <Link href="/games" data-testid="link-player-login-back">Vissza a játékokhoz</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
