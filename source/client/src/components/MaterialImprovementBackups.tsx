import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Database,
  Loader2,
  RotateCcw,
  Trash2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { hu } from "date-fns/locale";

interface Backup {
  id: string;
  originalFileId: string;
  improvedFileId: string | null;
  backupData: {
    id: string;
    title: string;
    content: string;
    description: string | null;
    classroom: number;
    contentType: string;
    displayOrder: number;
    userId: string | null;
    createdAt: string;
  };
  notes: string | null;
  createdAt: string;
}

export default function MaterialImprovementBackups() {
  const { toast } = useToast();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewBackupId, setPreviewBackupId] = useState<string | null>(null);

  // Get all backups
  const { data: backups = [], isLoading } = useQuery<Backup[]>({
    queryKey: ["/api/admin/improvement-backups"],
  });

  // Get single backup for preview
  const { data: previewBackup } = useQuery<Backup>({
    queryKey: [`/api/admin/improvement-backups/${previewBackupId}`],
    enabled: !!previewBackupId,
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/improvement-backups/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/improvement-backups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      setRestoringId(null);
      toast({
        title: "✅ Visszaállítva",
        description: "A fájl sikeresen visszaállítva a backup-ból.",
      });
    },
    onError: (error: Error) => {
      setRestoringId(null);
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült visszaállítani",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/improvement-backups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/improvement-backups"] });
      setDeletingId(null);
      toast({
        title: "Törölve",
        description: "A backup sikeresen törölve.",
      });
    },
    onError: (error: Error) => {
      setDeletingId(null);
      toast({
        title: "Hiba",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRestore = (id: string) => {
    setRestoringId(id);
  };

  const confirmRestore = () => {
    if (restoringId) {
      restoreMutation.mutate(restoringId);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-red-500 border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Database className="h-5 w-5" />
            Okosítás Backup-ok
          </CardTitle>
          <CardDescription>
            Itt találod az összes backup-ot, amely a javított fájlok alkalmazása előtt készült.
            Ezekből visszaállíthatod az eredeti fájlokat, ha szükséges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Még nincsenek backup-ok</p>
              <p className="text-sm mt-2">
                Backup-ok automatikusan készülnek, amikor javított fájlt alkalmazsz.
              </p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fájl címe</TableHead>
                    <TableHead>Osztály</TableHead>
                    <TableHead>Jegyzetek</TableHead>
                    <TableHead>Készült</TableHead>
                    <TableHead className="text-right">Műveletek</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium">
                        {backup.backupData.title}
                      </TableCell>
                      <TableCell>{backup.backupData.classroom}. osztály</TableCell>
                      <TableCell>
                        {backup.notes ? (
                          <span className="text-sm text-muted-foreground">{backup.notes}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(backup.createdAt), "yyyy. MM. dd. HH:mm", { locale: hu })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewBackupId(backup.id)}
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Előnézet
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(backup.id)}
                            disabled={restoreMutation.isPending}
                            className="border-red-500 bg-red-600 text-white hover:bg-red-700"
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Visszaállítás
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(backup.id)}
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      {previewBackup && (
        <Card className="border-red-500 border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-red-700">
                Backup Előnézet: {previewBackup.backupData.title}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setPreviewBackupId(null)}>
                Bezár
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Backup információk</h4>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Fájl ID:</span> {previewBackup.originalFileId}
                  </p>
                  <p>
                    <span className="font-medium">Készült:</span>{" "}
                    {format(new Date(previewBackup.createdAt), "yyyy. MM. dd. HH:mm:ss", {
                      locale: hu,
                    })}
                  </p>
                  {previewBackup.notes && (
                    <p>
                      <span className="font-medium">Jegyzetek:</span> {previewBackup.notes}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Backup tartalom</h4>
                <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                  <pre className="text-xs whitespace-pre-wrap">
                    {previewBackup.backupData.content || "Nincs elérhető tartalom"}
                  </pre>
                </ScrollArea>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setPreviewBackupId(null);
                    handleRestore(previewBackup.id);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Visszaállítás
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoringId !== null} onOpenChange={() => setRestoringId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Visszaállítás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan visszaállítod ezt a fájlt a backup-ból? Ez lecseréli a jelenlegi fájlt az
              eredeti tartalomra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              className="bg-red-600 hover:bg-red-700"
            >
              Visszaállítás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Törlés megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törölni szeretnéd ezt a backup-ot? Ez a művelet nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

