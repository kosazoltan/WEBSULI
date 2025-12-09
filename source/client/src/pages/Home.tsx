import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import FileBackupManager from "@/components/FileBackupManager";
import AdminFileDashboard from "@/components/AdminFileDashboard";
import UserFileList from "@/components/UserFileList";
import FileEditDialog from "@/components/FileEditDialog";
import EmailSendDialog from "@/components/EmailSendDialog";
import SimpleHtmlUpload from "@/components/SimpleHtmlUpload";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { getClassroomLabel } from "@shared/classrooms";
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

interface HtmlFileApi {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  description: string | null;
  classroom: number;
  contentType?: string;
  createdAt: string;
}

export default function Home() {
  const [editingFile, setEditingFile] = useState<HtmlFileApi | null>(null);
  const [sendingEmailFile, setSendingEmailFile] = useState<HtmlFileApi | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [viewMode, setViewMode] = useState<"admin" | "user">("admin");
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { isAdmin, isLoading: authLoading } = useAuth();

  const { data: files = [], isLoading } = useQuery<HtmlFileApi[]>({
    queryKey: ["/api/html-files"],
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { title?: string; description?: string; classroom?: number } }) => {
      return apiRequest("PATCH", `/api/html-files/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      setEditingFile(null);
      toast({
        title: "Módosítva",
        description: "A fájl sikeresen módosítva.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hiba történt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/html-files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      setDeletingFileId(null);
      toast({
        title: "Törölve",
        description: "A fájl sikeresen törölve.",
      });
    },
    onError: (error: Error) => {
      setDeletingFileId(null);
      toast({
        title: "Hiba történt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; description?: string; classroom: number }) => {
      console.log('[UPLOAD MUTATION] Starting upload, content size:', data.content.length);
      const startTime = Date.now();

      try {
        const result = await apiRequest("POST", "/api/html-files", data);
        const duration = Date.now() - startTime;
        console.log('[UPLOAD MUTATION] ✅ Upload successful in', duration, 'ms');
        return result;
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error('[UPLOAD MUTATION] ❌ Upload failed after', duration, 'ms:', error.message);
        throw error;
      }
    },
    onSuccess: (response: any) => {
      console.log('[UPLOAD MUTATION] onSuccess called');
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      setShowUploadZone(false);
      const classroom = response.classroom || 1;
      toast({
        title: "✅ Sikeres feltöltés!",
        description: `A HTML fájl sikeresen feltöltve (${getClassroomLabel(classroom, false)})`,
      });
    },
    onError: (error: Error) => {
      console.error('[UPLOAD MUTATION] onError called:', error);
      toast({
        title: "❌ Hiba történt",
        description: error.message || "Ismeretlen hiba történt a feltöltés során",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (id: string, updates: { title?: string; description?: string; classroom?: number }) => {
    editMutation.mutate({ id, updates });
  };

  const handleDelete = (id: string) => {
    setDeletingFileId(id);
  };

  const confirmDelete = () => {
    if (deletingFileId) {
      deleteMutation.mutate(deletingFileId);
    }
  };

  const handleViewFile = (file: HtmlFileApi) => {
    console.log('[VIEW FILE] Viewing file:', {
      id: file.id,
      title: file.title,
      contentType: file.contentType,
      hasContentType: 'contentType' in file,
      allKeys: Object.keys(file)
    });

    // PDF anyagok külön viewer oldalra mennek
    if (file.contentType === 'pdf') {
      console.log('[VIEW FILE] Routing to PDF viewer:', `/materials/pdf/${file.id}`);
      setLocation(`/materials/pdf/${file.id}`);
    } else {
      console.log('[VIEW FILE] Routing to preview:', `/preview/${file.id}`);
      setLocation(`/preview/${file.id}`);
    }
  };

  const handleUpload = (file: { title: string; content: string; description?: string; classroom: number }) => {
    console.log('[HANDLE UPLOAD] Called with title:', file.title, 'content length:', file.content.length);

    // Show immediate feedback
    toast({
      title: "📤 Feltöltés folyamatban...",
      description: `${Math.round(file.content.length / 1024)} KB méretű fájl küldése`,
    });

    uploadMutation.mutate(file);
  };

  const handleCancelUpload = () => {
    setShowUploadZone(false);
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Mobil: bottom padding a navigation miatt */}
      <div className={isMobile ? "pb-20" : ""}>
        {showUploadZone && viewMode === "admin" && isAdmin ? (
          <SimpleHtmlUpload
            onUpload={handleUpload}
            onCancel={handleCancelUpload}
            isPending={uploadMutation.isPending}
          />
        ) : viewMode === "admin" && isAdmin ? (
          <div className="space-y-6 px-3 sm:px-4 lg:px-6">
            <AdminFileDashboard
              files={files}
              isLoading={isLoading}
              currentUserId={undefined}
              onViewFile={handleViewFile}
              onEditFile={setEditingFile}
              onDeleteFile={handleDelete}
              onToggleView={() => setViewMode("user")}
              onSendEmail={setSendingEmailFile}
              onUploadClick={() => setShowUploadZone(true)}
            />
            <FileBackupManager />
          </div>
        ) : (
          <UserFileList
            files={files}
            isLoading={isLoading}
            onViewFile={handleViewFile}
            onToggleView={isAdmin ? () => setViewMode("admin") : undefined}
          />
        )}
      </div>

      {/* Mobil Bottom Navigation - csak admin usernek */}
      {isMobile && isAdmin && viewMode === "admin" && <MobileBottomNav />}

      {editingFile && (
        <FileEditDialog
          file={editingFile}
          onSave={handleEdit}
          onCancel={() => setEditingFile(null)}
        />
      )}

      {sendingEmailFile && (
        <EmailSendDialog
          isOpen={true}
          onClose={() => setSendingEmailFile(null)}
          fileId={sendingEmailFile.id}
          fileName={sendingEmailFile.title}
          classroom={sendingEmailFile.classroom}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deletingFileId !== null} onOpenChange={(open) => !open && setDeletingFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Törlés megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törölni szeretnéd ezt a tananyagot? Ez a művelet nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
