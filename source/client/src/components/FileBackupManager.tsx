import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Database, Download, RotateCcw, RefreshCw, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BackupFile {
  filename: string;
  size: number;
  created: Date;
}

export default function FileBackupManager() {
  const { toast } = useToast();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  // Fetch backup list
  const { data: backups = [], isLoading, refetch } = useQuery<BackupFile[]>({
    queryKey: ["/api/admin/file-backups"],
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (filename: string) => {
      const response = await apiRequest("POST", `/api/admin/file-backups/restore/${filename}`, {});
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "✅ Visszaállítás sikeres",
        description: `${data.materialsRestored} anyag visszaállítva`,
      });
      setRestoreTarget(null);
      // Invalidate all queries to reload data
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/file-backups"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "❌ Visszaállítás sikertelen",
        description: error.message || "Ismeretlen hiba történt",
      });
      setRestoreTarget(null);
    },
  });

  // Download backup
  const handleDownload = async (filename: string) => {
    try {
      const response = await fetch(`/api/admin/file-backups/download/${filename}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Letöltési hiba: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Letöltés sikeres",
        description: `${filename} letöltve`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "❌ Letöltési hiba",
        description: error.message || "Nem sikerült letölteni a backup fájlt",
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string | Date): string => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return new Intl.DateTimeFormat('hu-HU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <>
      <Card data-testid="card-file-backup-manager">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Automatikus Mentések
              </CardTitle>
              <CardDescription>
                Fájl-alapú mentések kezelése (naponta 02:00 + esemény-alapú)
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-refresh-backups"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Mentések betöltése...
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nincs elérhető mentés
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                  data-testid={`backup-item-${backup.filename}`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{backup.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(backup.created)} • {formatFileSize(backup.size)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(backup.filename)}
                      data-testid={`button-download-${backup.filename}`}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setRestoreTarget(backup.filename)}
                      disabled={restoreMutation.isPending}
                      data-testid={`button-restore-${backup.filename}`}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore confirmation dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Biztosan visszaállítod ezt a mentést?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ez a művelet törli az összes jelenlegi adatot és visszaállítja a kiválasztott mentésből. 
              Automatikusan készül egy biztonsági mentés a jelenlegi állapotról visszaállítás előtt.
              <br /><br />
              <strong>Mentés:</strong> {restoreTarget}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore">Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && restoreMutation.mutate(restoreTarget)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending ? "Visszaállítás..." : "Visszaállítás"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
