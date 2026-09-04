import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { NOTE_KIND_LABELS, groupNotesBySeverity, type ApiNote } from "@shared/studio-ui";

/**
 * LS-2c — the lektor's report, grouped by severity.
 *
 * Three lists (blocker / warn / info) plus the admin-only box: `book_probably_wrong`
 * notes. The pupil never sees those — per D1 the source wins even when it is wrong,
 * so the observation goes to the admin and nothing in the lesson changes.
 */

const SEVERITY_STYLES: Record<string, { icon: typeof AlertTriangle; className: string; label: string }> = {
  blocker: { icon: ShieldAlert, className: "border-red-300 dark:border-red-800", label: "Blokkoló" },
  warn: { icon: AlertTriangle, className: "border-amber-300 dark:border-amber-800", label: "Figyelmeztetés" },
  info: { icon: Info, className: "border-border", label: "Információ" },
};

function NoteRow({ note }: { note: { kind: string; subkind: string | null; message: string; blockPath: string | null } }) {
  return (
    <div className="rounded border border-border p-2 space-y-1" data-testid={`note-${note.kind}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {NOTE_KIND_LABELS[note.kind] ?? note.kind}
        </Badge>
        {note.subkind && note.subkind !== "book_probably_wrong" && (
          <Badge variant="secondary" className="text-[10px]">
            {note.subkind}
          </Badge>
        )}
        {note.blockPath && (
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">{note.blockPath}</span>
        )}
      </div>
      <p className="text-sm">{note.message}</p>
    </div>
  );
}

export function LektorNotes({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery<{ notes: ApiNote[] }>({
    queryKey: ["/api/studio/jobs", jobId, "notes"],
    queryFn: () => apiRequest("GET", `/api/studio/jobs/${jobId}/notes`),
    enabled: jobId.length > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Info className="w-4 h-4 animate-pulse" /> Lektor-jegyzetek betöltése…
      </div>
    );
  }

  const groups = groupNotesBySeverity(data?.notes ?? []);
  const empty =
    groups.blocker.length === 0 && groups.warn.length === 0 && groups.info.length === 0 && groups.adminOnly.length === 0;

  if (empty) {
    return (
      <Card data-testid="lektor-notes">
        <CardHeader>
          <CardTitle className="text-base">A lektor jegyzetei</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Még nincsenek jegyzetek — a lektor a lecke elkészülte után olvassa újra.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="lektor-notes">
      <CardHeader>
        <CardTitle className="text-base">A lektor jegyzetei</CardTitle>
        <CardDescription className="text-xs">
          A lektor újraolvasta a leckét a jóváhagyott térkép alapján. Jelent, soha nem ír át.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["blocker", "warn", "info"] as const).map((severity) => {
          const list = groups[severity];
          if (list.length === 0) return null;
          const style = SEVERITY_STYLES[severity];
          const Icon = style.icon;
          return (
            <div key={severity} className={`rounded-lg border p-3 space-y-2 ${style.className}`} data-testid={`notes-${severity}`}>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="w-4 h-4" />
                {style.label} <Badge variant="outline" className="text-[10px]">{list.length}</Badge>
              </div>
              {list.map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </div>
          );
        })}

        {groups.adminOnly.length > 0 && (
          <div
            className="rounded-lg border border-border bg-muted/60 p-3 space-y-2"
            data-testid="admin-only-notes"
          >
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Info className="w-4 h-4" />
              Csak neked
              <Badge variant="outline" className="text-[10px]">{groups.adminOnly.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              A lektor úgy látja, a tankönyv valamelyik állítása tévedhet. A lecke ettől még a
              forrás szerint marad — ezt a jegyzetet a gyerek sosem látja.
            </p>
            {groups.adminOnly.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
