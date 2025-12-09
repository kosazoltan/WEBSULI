import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { Download, Upload, AlertCircle, Save, FileJson, Database, Code2, RefreshCw } from "lucide-react";
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

export default function BackupManager() {
  const { toast } = useToast();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export backup mutation
  const exportBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/backups/export", {
        method: "GET",
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Export sikertelen");
      }
      
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anyagok-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Backup exportálva",
        description: "A backup fájl letöltése megkezdődött.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült exportálni a backup-ot",
        variant: "destructive",
      });
    }
  });

  // Import backup mutation
  const importBackupMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const backupData = JSON.parse(text);
      
      return await apiRequest("POST", "/api/admin/backups/import", { backupData });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      toast({
        title: "Backup importálva",
        description: `${response.materialsCount} anyag sikeresen visszaállítva.`,
      });
      setSelectedFile(null);
      setShowImportDialog(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült importálni a backup-ot",
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.json')) {
        toast({
          title: "Érvénytelen fájl",
          description: "Csak .json fájlokat lehet feltölteni",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setShowImportDialog(true);
    }
  };

  const handleImport = () => {
    if (!selectedFile) return;
    importBackupMutation.mutate(selectedFile);
  };

  // Production → Dev sync mutation
  const syncFromProductionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/sync-from-production", {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      toast({
        title: "✅ Szinkronizálás sikeres",
        description: response.message || "Production adatbázis sikeresen másolva dev-be.",
      });
      setShowSyncDialog(false);
    },
    onError: (error: any) => {
      console.error('[SYNC ERROR] Full error:', error);
      
      // Extract detailed error information
      const errorMessage = error.error || error.message || "Nem sikerült szinkronizálni a production adatbázist";
      const errorDetails = error.details || '';
      
      toast({
        title: "❌ Szinkronizálási hiba",
        description: (
          <div className="space-y-2">
            <p className="font-semibold">{errorMessage}</p>
            {errorDetails && (
              <pre className="text-xs bg-destructive/10 p-2 rounded overflow-auto max-h-40">
                {errorDetails}
              </pre>
            )}
          </div>
        ),
        variant: "destructive",
        duration: 10000, // Show longer for detailed errors
      });
      setShowSyncDialog(false);
    }
  });

  return (
    <div className="space-y-6">
      {/* Warning Alert */}
      <Card className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
            <AlertCircle className="h-5 w-5" />
            Fontos információk
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-orange-600 dark:text-orange-300 space-y-2">
          <p>• A backup fájl letölthető a mobilodra vagy asztali gépedre</p>
          <p>• Az oldal összeomlása esetén a backup fájl feltöltésével visszaállítható az összes anyag</p>
          <p>• A backup import TÖRLI az összes jelenlegi tananyagot és a fájlból állítja vissza őket</p>
          <p>• Ajánlott rendszeresen backup-ot készíteni és biztonságos helyen tárolni</p>
        </CardContent>
      </Card>

      {/* Export & Import Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Export Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Backup letöltése
            </CardTitle>
            <CardDescription>
              Mentsd le az összes tananyagot JSON fájlként
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
              <FileJson className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                <p className="font-medium mb-1">Export tartalom:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Összes tananyag (cím, tartalom, leírás)</li>
                  <li>Osztály besorolások</li>
                  <li>Létrehozási dátumok</li>
                </ul>
              </div>
            </div>
            <Button
              onClick={() => exportBackupMutation.mutate()}
              disabled={exportBackupMutation.isPending}
              className="w-full"
              data-testid="button-export-backup"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportBackupMutation.isPending ? "Exportálás..." : "Backup letöltése"}
            </Button>
          </CardContent>
        </Card>

        {/* Import Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Backup feltöltése
            </CardTitle>
            <CardDescription>
              Állítsd vissza az anyagokat egy korábban mentett fájlból
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-5 w-5 mt-0.5 text-destructive" />
              <div className="flex-1 text-sm">
                <p className="font-medium mb-1 text-destructive">Figyelem!</p>
                <p className="text-muted-foreground">
                  A feltöltés TÖRLI az összes jelenlegi anyagot és a backup fájlból állítja vissza őket.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-file">Válassz backup fájlt (.json)</Label>
              <Input
                id="backup-file"
                type="file"
                accept=".json"
                ref={fileInputRef}
                onChange={handleFileSelect}
                data-testid="input-backup-file"
              />
            </div>
          </CardContent>
        </Card>

        {/* Production → Dev Sync */}
        <Card className="border-purple-500/50 bg-purple-50 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <RefreshCw className="h-5 w-5" />
              Production → Dev Sync
            </CardTitle>
            <CardDescription>
              Másolja át a production adatbázist dev-be
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-5 w-5 mt-0.5 text-destructive" />
              <div className="flex-1 text-sm">
                <p className="font-medium mb-1 text-destructive">Figyelem!</p>
                <p className="text-muted-foreground">
                  Teljesen törli a dev adatbázist és production-ból másolja felül!
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowSyncDialog(true)}
              disabled={syncFromProductionMutation.isPending}
              variant="outline"
              className="w-full border-purple-500/50 hover:bg-purple-100 dark:hover:bg-purple-950/30"
              data-testid="button-sync-from-production"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncFromProductionMutation.isPending ? 'animate-spin' : ''}`} />
              {syncFromProductionMutation.isPending ? "Szinkronizálás..." : "Szinkronizálás"}
            </Button>
          </CardContent>
        </Card>

        {/* Download Source Code */}
        <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Code2 className="h-5 w-5" />
              Forráskód letöltése
            </CardTitle>
            <CardDescription>
              Teljes projekt forráskód ZIP fájlként
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
              <Code2 className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                <p className="font-medium mb-1">Tartalom:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Frontend & Backend forráskód</li>
                  <li>Konfigurációs fájlok</li>
                  <li>README telepítési útmutatóval</li>
                  <li>Dokumentáció (replit.md)</li>
                </ul>
              </div>
            </div>
            <Button
              onClick={async () => {
                try {
                  // Add timestamp to prevent browser caching
                  const timestamp = Date.now();
                  const response = await fetch(`/api/admin/download-source?t=${timestamp}`, {
                    credentials: 'include', // Send session cookie for authentication
                  });
                  
                  if (!response.ok) {
                    if (response.status === 401) {
                      throw new Error('Bejelentkezés szükséges');
                    }
                    throw new Error(`Letöltési hiba: ${response.status}`);
                  }
                  
                  // Get the blob and create download link
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  
                  // Generate filename with current timestamp
                  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                  a.download = `anyagok-profiknak-source-${now}.zip`;
                  
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                  
                  toast({
                    title: "✅ Forráskód letöltve",
                    description: "A ZIP fájl letöltése megkezdődött",
                  });
                } catch (error: any) {
                  console.error('Download error:', error);
                  toast({
                    variant: "destructive",
                    title: "❌ Letöltési hiba",
                    description: error.message || "Nem sikerült letölteni a forráskódot",
                  });
                }
              }}
              className="w-full"
              variant="outline"
              data-testid="button-download-source"
            >
              <Download className="mr-2 h-4 w-4" />
              Forráskód letöltése (.zip)
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Production → Dev Sync Confirmation Dialog */}
      <AlertDialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Production → Dev szinkronizálás</AlertDialogTitle>
            <AlertDialogDescription>
              Ez a művelet <strong>teljesen törli</strong> a dev adatbázis tartalmát és production-ból másolja át az összes adatot.
              <br /><br />
              Biztosan folytatod?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégsem</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => syncFromProductionMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90"
            >
              Igen, szinkronizálás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Confirmation Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Biztosan visszaállítod ezt a backup-ot?</AlertDialogTitle>
            <AlertDialogDescription>
              Ez a művelet törli az összes jelenlegi tananyagot és a <strong>{selectedFile?.name}</strong> fájlból állítja vissza őket.
              <br /><br />
              <span className="text-destructive font-semibold">Ez a művelet NEM vonható vissza!</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              data-testid="button-cancel-import"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Mégse
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleImport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-import"
              disabled={importBackupMutation.isPending}
            >
              {importBackupMutation.isPending ? "Importálás..." : "Visszaállítás"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
