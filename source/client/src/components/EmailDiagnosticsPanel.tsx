import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  Mail,
  AlertTriangle,
  Activity,
  FileText,
  Users,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/**
 * Email-diagnosztikai panel admin oldalra.
 *
 * Egyetlen `/api/admin/email-diagnostics` GET hívásra mindent megjelenít:
 *  - Resend config állapot (kulcs + from-email + reason ha hibás)
 *  - Osztályonkénti címzett-bontás (1-12, mennyi feliratkozó / extra-email)
 *  - Utolsó 10 tananyag-feltöltés + hozzájuk tartozó email-statisztikák
 *  - Utolsó 30 email_logs bejegyzés (ki, mikor, sikeres / hibás, error)
 *
 * A "0 címzett" probléma azonnal látható lesz: ha pl. 8. osztályos anyagot
 * töltesz fel és a 8. sor üres, a tanulók osztály-besorolása elavult.
 */

type ResendStatus = { ok: boolean; reason?: string; fromEmail?: string };

type ClassroomBreakdown = { classroom: number; subscriptions: number; extras: number };

type EmailLogRow = {
  id: string;
  htmlFileId: string | null;
  recipientEmail: string;
  status: string;
  error: string | null;
  createdAt: string | Date;
};

type RecentUpload = {
  id: string;
  title: string;
  classroom: number;
  createdAt: string | Date;
  emailsSent: number;
  emailsFailed: number;
};

type DiagnosticsResponse = {
  resend: ResendStatus;
  classroomBreakdown: ClassroomBreakdown[];
  totalActiveSubscriptions: number;
  totalActiveExtras: number;
  recentLogs: EmailLogRow[];
  recentUploads: RecentUpload[];
};

function fmtDate(d: string | Date) {
  try {
    return format(new Date(d), "yyyy. MM. dd. HH:mm", { locale: hu });
  } catch {
    return String(d);
  }
}

export default function EmailDiagnosticsPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DiagnosticsResponse>({
    queryKey: ["/api/admin/email-diagnostics"],
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-500" />
                Email-küldés diagnosztika
              </CardTitle>
              <CardDescription>
                Ha új tananyag feltöltése után nem érkezik email, itt látod, hogy hol akadt el. A
                leggyakoribb gyökérok: <strong>0 címzett egy adott osztályra</strong> — a bontásból
                rögtön látható.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
              data-testid="button-refresh-diagnostics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Frissítés
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="py-6">
            <Skeleton className="h-4 w-64 mb-3" />
            <Skeleton className="h-4 w-48 mb-3" />
            <Skeleton className="h-4 w-80" />
          </CardContent>
        </Card>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-6 text-destructive flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            Hiba a diagnosztika betöltésekor.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Resend config */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Resend konfiguráció
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.resend.ok ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">OK</span>
                  {data.resend.fromEmail && (
                    <span className="text-sm text-muted-foreground">
                      — feladó: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{data.resend.fromEmail}</code>
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2 text-destructive">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">NINCS megfelelően konfigurálva</p>
                    {data.resend.reason && <p className="text-sm">{data.resend.reason}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Render → Environment-ben állítsd be: <code>RESEND_API_KEY</code> +{" "}
                      <code>RESEND_FROM_EMAIL</code>.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-classroom breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Osztályonkénti címzettek
              </CardTitle>
              <CardDescription>
                Összes aktív feliratkozó: <strong>{data.totalActiveSubscriptions}</strong> · extra
                e-mail: <strong>{data.totalActiveExtras}</strong>. Ha egy adott osztály oszlopa{" "}
                <strong>0</strong>, akkor arra az osztályra <strong>nem küld emailt</strong> a
                rendszer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {data.classroomBreakdown.map((cb) => {
                  const total = cb.subscriptions + cb.extras;
                  const empty = total === 0;
                  return (
                    <div
                      key={cb.classroom}
                      className={`rounded-md border p-2 ${empty ? "border-amber-400/60 bg-amber-50 dark:bg-amber-900/20" : "border-emerald-300/40 bg-emerald-50 dark:bg-emerald-900/15"}`}
                      data-testid={`classroom-${cb.classroom}-breakdown`}
                    >
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span>{cb.classroom}. oszt.</span>
                        {empty && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Feliratkozó: <strong>{cb.subscriptions}</strong>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Extra: <strong>{cb.extras}</strong>
                      </div>
                      <div className="text-[10px] mt-0.5 font-semibold">
                        Összes: <span className={empty ? "text-amber-600" : "text-emerald-600"}>{total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent uploads */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Utolsó 10 tananyag-feltöltés
              </CardTitle>
              <CardDescription>
                A feltöltés címéből kinyert osztályszám alapján szűr a rendszer. Ha a "Sikeres"
                oszlop 0 és a "Hibás" is 0, akkor <strong>egyetlen címzett sem volt</strong> az adott
                osztályra (classroom-mismatch).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentUploads.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nincs még tananyag-feltöltés.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.recentUploads.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 p-2 border rounded-md text-xs"
                      data-testid={`upload-row-${u.id}`}
                    >
                      <Badge variant="secondary" className="flex-shrink-0">
                        {u.classroom}. oszt.
                      </Badge>
                      <span className="flex-1 min-w-0 truncate font-medium">{u.title}</span>
                      <span className="text-muted-foreground hidden sm:inline">{fmtDate(u.createdAt)}</span>
                      <Badge
                        variant="outline"
                        className={
                          u.emailsSent > 0
                            ? "border-emerald-400/60 text-emerald-700 dark:text-emerald-300"
                            : "border-amber-400/60 text-amber-700 dark:text-amber-300"
                        }
                      >
                        ✓ {u.emailsSent}
                      </Badge>
                      {u.emailsFailed > 0 && (
                        <Badge variant="outline" className="border-rose-400/60 text-rose-700 dark:text-rose-300">
                          ✗ {u.emailsFailed}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent email logs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Utolsó 30 e-mail küldés
              </CardTitle>
              <CardDescription>
                Ha új tananyag-feltöltés óta nincs új sor, akkor a háttér-task egyáltalán nem indult
                el (config probléma vagy "0 címzett" eset).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nincs e-mail-log bejegyzés. (Ez tipikus, ha még nem volt sikeres küldés vagy a
                  Resend nincs konfigurálva.)
                </p>
              ) : (
                <div className="space-y-1">
                  {data.recentLogs.map((log) => {
                    const ok = log.status === "sent";
                    return (
                      <div
                        key={log.id}
                        className={`flex items-start gap-2 p-1.5 border rounded text-[11px] ${ok ? "border-emerald-300/40" : "border-rose-300/40 bg-rose-50/50 dark:bg-rose-900/10"}`}
                        data-testid={`email-log-${log.id}`}
                      >
                        {ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] text-muted-foreground">{fmtDate(log.createdAt)}</span>
                            <span className="font-semibold truncate">{log.recipientEmail}</span>
                          </div>
                          {log.error && (
                            <p className="text-rose-700 dark:text-rose-300 mt-0.5 break-all">{log.error}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
