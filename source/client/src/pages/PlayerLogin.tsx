/**
 * JM7a — játékos belépés / regisztráció (`/belepes`, `/belepes/link`; terv 10.4, D11). E-mail-cím + 6 jegyű kód VAGY a
 * levélben kapott link; jelszó, név, életkor nincs. A link tokenje a URL-töredékben (`#t=`) érkezik: azonnal törlődik a
 * címsorból, és POST-tal váltjuk be (a levelező linkellenőrzője így nem használja el). A `PLAYER_ACCOUNTS` flag KI
 * állapotában az oldal nem létezik (a „nem található” oldal jelenik meg).
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import NotFound from "@/pages/not-found";
import {
  PLAYER_ME_KEY, logoutPlayer, startPlayerLogin, usePlayer, verifyPlayerLogin, type VerifyResult,
} from "@/hooks/usePlayer";

type Step = "email" | "code" | "link" | "done" | "link-error";

const ERRORS: Record<Exclude<VerifyResult, { ok: true }>["code"] | "INVALID_EMAIL", string> = {
  INVALID_OR_EXPIRED: "Ez a kód nem jó, vagy már lejárt. Nézd meg újra a leveled, vagy kérj új kódot!",
  BANNED: "Ezzel a fiókkal most nem lehet belépni.",
  RATE_LIMITED: "Túl sok próbálkozás. Várj egy kicsit, és próbáld újra!",
  UNAVAILABLE: "A belépés most nem elérhető.",
  SERVER_ERROR: "Valami elromlott. Próbáld újra egy kicsit később!",
  NETWORK: "Nem sikerült elérni a szervert. Nézd meg, van-e internet, és próbáld újra!",
  INVALID_EMAIL: "Ez nem tűnik e-mail-címnek. Nézd meg, jól írtad-e!",
};

const LINK_INVALID = "Ez a link már nem jó: lejárt, vagy valaki már használta. Kérj új kódot!";

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
  const [step, setStep] = useState<Step>(isLinkRoute ? "link" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkHandled = useRef(false);
  /** A link tokenje a címsorból törlődik, de hálózati hibánál újrapróbálható — ezért csak memóriában marad meg. */
  const linkToken = useRef<string | null>(null);
  const [linkRetryable, setLinkRetryable] = useState(false);
  // Review #445: lecsatolás után ne írjunk állapotot (a válasz / időtúllépés később érkezhet).
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: PLAYER_ME_KEY });
    if (mounted.current) setStep("done");
  };

  const redeemLink = async () => {
    const token = linkToken.current;
    if (!token) { setStep("link-error"); return; }
    setStep("link"); setError(null); setLinkRetryable(false);
    const r = await verifyPlayerLogin({ kind: "link", linkToken: token });
    if (!mounted.current) return;
    if (r.ok) { linkToken.current = null; await finish(); return; }
    setLinkRetryable(r.code === "NETWORK" || r.code === "SERVER_ERROR");
    setError(r.code === "INVALID_OR_EXPIRED" ? LINK_INVALID : ERRORS[r.code]);
    setStep("link-error");
  };

  useEffect(() => {
    if (!isLinkRoute || !enabled || linkHandled.current) return;
    linkHandled.current = true;
    linkToken.current = takeLinkToken();
    void redeemLink();
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
      else setError(ERRORS[r.code]);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const logout = async () => {
    const ok = await logoutPlayer();
    await queryClient.invalidateQueries({ queryKey: PLAYER_ME_KEY });
    if (!mounted.current) return;
    if (ok) { setError(null); setStep("email"); }
    else setError(ERRORS.NETWORK);
  };

  const signedIn = step === "done" || (player && step !== "code");

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background" data-testid="page-player-login">
      <Card className="w-full max-w-sm border-orange-500/20 shadow-xl">
        <CardHeader className="text-center space-y-2 [@media(max-height:480px)]:pb-2 [@media(max-height:480px)]:pt-4">
          <div className="text-4xl [@media(max-height:480px)]:hidden" aria-hidden="true">🎮</div>
          <CardTitle className="text-2xl">{signedIn ? "Bent vagy!" : "Belépés a játékokhoz"}</CardTitle>
          {!signedIn && step === "email" && (
            <CardDescription>Írd be az e-mail-címed, és küldünk egy 6 jegyű kódot. Jelszó nem kell.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {signedIn ? (
            <div className="space-y-3 text-center" data-testid="player-login-done">
              <p>Sikerült a belépés. Jó játékot! 🎉</p>
              <Button className="w-full" onClick={() => setLocation("/games")} data-testid="button-player-to-games">Irány a játékok!</Button>
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
            </form>
          ) : step === "code" ? (
            <form onSubmit={submitCode} className="space-y-3">
              <p className="text-sm">Elküldtük a kódot az e-mail-címedre. A levélben lévő gombbal is beléphetsz. Ha nem látod a levelet, nézd meg a Spam mappát is!</p>
              <div className="space-y-1.5">
                <Label htmlFor="player-code">6 jegyű kód</Label>
                <Input id="player-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
                  className="h-14 text-center text-2xl tracking-[0.4em]" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="input-player-code" />
              </div>
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6} data-testid="button-player-verify">
                {busy ? "Ellenőrzés…" : "Belépés"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("email"); setError(null); }} data-testid="button-player-new-code">
                Új kódot kérek / másik cím
              </Button>
            </form>
          ) : step === "link" ? (
            <p className="text-center" data-testid="player-login-linking">Belépés folyamatban…</p>
          ) : (
            <div className="space-y-3 text-center" data-testid="player-login-link-error">
              <p role="alert">{error ?? LINK_INVALID}</p>
              {linkRetryable && (
                <Button className="w-full" onClick={() => void redeemLink()} data-testid="button-player-link-retry">Újrapróbálom</Button>
              )}
              <Button className="w-full" variant={linkRetryable ? "ghost" : "default"} onClick={() => { linkToken.current = null; setError(null); setStep("email"); setLocation("/belepes"); }}>Új kódot kérek</Button>
            </div>
          )}
          {error && step !== "link-error" && (
            <p role="alert" className="text-sm text-destructive" data-testid="player-login-error">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
